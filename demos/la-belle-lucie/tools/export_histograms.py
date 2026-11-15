#!/usr/bin/env python3
"""Export engine reports as long-form CSV without any rendering dependencies."""

import argparse
import csv
import json
from pathlib import Path


def export_report(report, destination):
    game_count = report["games"]
    card_count = report["rules"]["suits"] * report["rules"]["ranks"]
    series = [("final", "", report["finalHistogram"])]
    for round_report in report["rounds"]:
        series.append(("cumulative", round_report["round"], round_report["cumulativeHistogram"]))
        series.append(("incremental", round_report["round"], round_report["incrementalHistogram"]))
    with destination.open("w", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["series", "round", "cards", "completeness", "count", "probability", "cdf"])
        for name, round_number, histogram in series:
            if sum(histogram) != game_count:
                raise ValueError("Histogram counts do not match the number of games")
            cumulative_count = 0
            for cards, count in enumerate(histogram[:card_count + 1]):
                cumulative_count += count
                writer.writerow([
                    name, round_number, cards, cards / card_count, count,
                    count / game_count, cumulative_count / game_count,
                ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    export_report(json.loads(arguments.report.read_text()), arguments.output)


if __name__ == "__main__":
    main()
