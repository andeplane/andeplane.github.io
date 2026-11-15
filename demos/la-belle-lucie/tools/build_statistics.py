#!/usr/bin/env python3
"""Publish compact, auditable statistics from actual joint per-game records.

Marginal histograms cannot recover conditional probabilities. Every published
joint cell is counted from a CSV row, then reconciled against the native report.
The raw CSV stays in build/; the lossless score-count cube ships with the app.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
import subprocess


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def aggregate(records, report):
    games, start = report['games'], report['startIndex']
    if report['rules']['suits'] != 4 or report['rules']['ranks'] != 13 or report['rules']['rounds'] != 3:
        raise ValueError('Statistics require the standard 52-card, three-round game')
    if report['strategy'] != 'round-optimal' or report['optimality']['truncatedSearches']:
        raise ValueError('The primary experiment must use uncapped round-optimal search')
    seen, joint = bytearray(games), Counter()
    cumulative = [[0] * 53 for _ in range(3)]
    incremental = [[0] * 53 for _ in range(3)]
    examples = {}

    def candidate(key, ordering, index, scores):
        previous = examples.get(key)
        if previous is None or ordering < previous[0]:
            examples[key] = (ordering, index, scores)

    with Path(records).open(newline='') as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ['game_index', 'round_1', 'round_2', 'round_3']:
            raise ValueError('Unexpected records schema')
        for row in reader:
            index = int(row['game_index'])
            offset = index - start
            if not 0 <= offset < games or seen[offset]:
                raise ValueError('Duplicate or out-of-range game index')
            seen[offset] = 1
            scores = [int(row[f'round_{r}']) for r in (1, 2, 3)]
            if not 0 <= scores[0] <= scores[1] <= scores[2] <= 52:
                raise ValueError('Scores must be monotonic and in 0..52')
            joint[(scores[0] * 53 + scores[1]) * 53 + scores[2]] += 1
            for r, score in enumerate(scores):
                cumulative[r][score] += 1
                incremental[r][score - (scores[r - 1] if r else 0)] += 1
            if scores[2] == 52:
                candidate('slow-start', (scores[0], index), index, scores)
                candidate('last-round-rescue', (scores[1], index), index, scores)
                first = next(r + 1 for r, score in enumerate(scores) if score == 52)
                candidate(f'win-round-{first}', (index,), index, scores)
            else:
                candidate('strong-start-loss', (-scores[0], index), index, scores)
    if sum(seen) != games:
        raise ValueError('Missing game records')
    for r, expected in enumerate(report['rounds']):
        if cumulative[r] != expected['cumulativeHistogram'] or incremental[r] != expected['incrementalHistogram']:
            raise ValueError(f'Records disagree with report for round {r + 1}')
    if cumulative[2] != report['finalHistogram'] or cumulative[2][52] != report['wins']:
        raise ValueError('Final scores disagree with report')
    titles = {
        'slow-start': 'Smallest round-one score that still won',
        'last-round-rescue': 'Biggest final-round rescue',
        'strong-start-loss': 'Strongest start that still lost',
        'win-round-1': 'A win in the first deal',
        'win-round-2': 'A win in the second deal',
        'win-round-3': 'A win in the final deal',
    }
    return sorted(joint.items()), [
        {'id': key, 'title': titles[key], 'gameIndex': value[1], 'scores': value[2]}
        for key, value in examples.items()
    ]


def write_exports(data, directory):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'analysis.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
    with (directory / 'joint-scores.csv').open('w', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['round_1', 'round_2', 'round_3', 'games'])
        for index, count in data['joint']:
            writer.writerow([index // (53 * 53), (index // 53) % 53, index % 53, count])
    with (directory / 'round-histograms.csv').open('w', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['round', 'kind', 'cards', 'games', 'probability'])
        for r in data['rounds']:
            for kind in ['cumulative', 'incremental']:
                for score, count in enumerate(r[kind + 'Histogram']):
                    writer.writerow([r['round'], kind, score, count, count / data['experiment']['games']])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--records', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--comparison', type=Path, action='append', default=[])
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    if args.reference:
        reference = json.loads(args.reference.read_text())
        for key in ['seed', 'startIndex', 'games', 'wins', 'rounds', 'finalHistogram']:
            if reference[key] != report[key]:
                raise ValueError(f'Rerun does not reproduce the original sample: {key}')
    joint, examples = aggregate(args.records, report)
    root = Path(__file__).resolve().parents[1]
    data = {
        'schemaVersion': 1,
        'experiment': {
            'id': 'round-optimal-minmoves-million',
            'games': report['games'], 'seed': str(report['seed']), 'startIndex': report['startIndex'],
            'strategy': report['strategy'], 'description': report['optimality']['description'],
            'rules': report['rules'], 'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
            'recordsSha256': sha256(args.records), 'reportSha256': sha256(args.report),
            'engineSha256': sha256(root / 'src' / 'engine.hpp'),
            'jointEncoding': '(round_1 * 53 + round_2) * 53 + round_3',
            'samplingNote': 'The same seeded million-game sample, rerun to retain joint scores; not an additional million independent games.',
        },
        'rounds': report['rounds'], 'finalHistogram': report['finalHistogram'],
        'joint': joint, 'examples': examples, 'strategies': [],
    }
    labels = {'round-optimal': 'Round optimal · fewest moves', 'greedy': 'Greedy', 'random': 'Random', 'lookahead': 'Sampled lookahead'}
    for path in [args.report, *args.comparison]:
        comparison = json.loads(path.read_text())
        data['strategies'].append({
            'id': comparison['strategy'], 'label': labels[comparison['strategy']],
            **{key: comparison[key] for key in ['games', 'wins', 'seed', 'winProbability', 'winProbability95CI', 'meanFinalCards', 'optimality']},
        })
    write_exports(data, args.output)
    print(json.dumps({'games': report['games'], 'jointCells': len(joint), 'wins': report['wins'], 'output': str(args.output), 'reconciled': True}))


if __name__ == '__main__':
    main()
