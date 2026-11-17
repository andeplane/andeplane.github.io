import csv
import io
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from build_statistics import aggregate


class StatisticsExportTests(unittest.TestCase):
    def fixture(self, rows):
        cumulative = [[0] * 53 for _ in range(3)]
        incremental = [[0] * 53 for _ in range(3)]
        for _, *scores in rows:
            for r, score in enumerate(scores):
                cumulative[r][score] += 1
                incremental[r][score - (scores[r - 1] if r else 0)] += 1
        return {'games': len(rows), 'startIndex': 0, 'rules': {'suits': 4, 'ranks': 13, 'rounds': 3}, 'strategy': 'round-optimal', 'optimality': {'truncatedSearches': 0}, 'wins': cumulative[2][52], 'finalHistogram': cumulative[2], 'rounds': [{'cumulativeHistogram': a, 'incrementalHistogram': b} for a, b in zip(cumulative, incremental)]}

    def test_out_of_order_rows_reconcile_and_examples_are_deterministic(self):
        rows = [[2, 50, 50, 50], [0, 0, 0, 52], [1, 10, 20, 52]]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'records.csv'
            def write(values):
                with path.open('w', newline='') as output:
                    writer = csv.writer(output)
                    writer.writerow(['game_index', 'round_1', 'round_2', 'round_3'])
                    writer.writerows(values)
            write(rows)
            result = aggregate(path, self.fixture(rows))
            write(list(reversed(rows)))
            other = aggregate(path, self.fixture(rows))
            self.assertEqual(result[0], other[0])
            self.assertEqual({x['id']: x for x in result[1]}, {x['id']: x for x in other[1]})
            self.assertEqual(sum(count for _, count in result[0]), 3)
            self.assertEqual(next(x for x in result[1] if x['id'] == 'last-round-rescue')['scores'], [0, 0, 52])
            write([rows[0], rows[0], rows[1]])
            with self.assertRaises(ValueError):
                aggregate(path, self.fixture(rows))
            write(rows)
            corrupted = self.fixture(rows)
            corrupted['rounds'][1]['cumulativeHistogram'][20] += 1
            with self.assertRaises(ValueError):
                aggregate(path, corrupted)


if __name__ == '__main__':
    unittest.main()
