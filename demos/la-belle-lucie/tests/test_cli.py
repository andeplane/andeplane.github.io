import csv
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "build" / "kabal"
sys.path.insert(0, str(ROOT / "tools"))
from exact_model import ExactModel
from export_histograms import export_report


def run_engine(*arguments):
    result = subprocess.run(
        [str(ENGINE), *map(str, arguments)], check=True, text=True, capture_output=True
    )
    return json.loads(result.stdout)


class EngineCliTests(unittest.TestCase):
    def assert_histogram_consistency(self, report):
        games = report["games"]
        card_count = report["rules"]["suits"] * report["rules"]["ranks"]
        self.assertEqual(sum(report["finalHistogram"]), games)
        self.assertEqual(report["wins"], report["finalHistogram"][card_count])
        self.assertEqual(report["finalHistogram"][card_count - 1], 0)
        expected_score = sum(
            score * count for score, count in enumerate(report["finalHistogram"])
        ) / games
        self.assertAlmostEqual(report["meanFinalCards"], expected_score, places=8)
        self.assertAlmostEqual(report["meanCompleteness"], expected_score / card_count)
        previous_mean = 0
        previous_wins = 0
        for round_report in report["rounds"]:
            for name in ["cumulativeHistogram", "incrementalHistogram"]:
                self.assertEqual(sum(round_report[name]), games)
            self.assertAlmostEqual(
                round_report["meanCumulativeCards"] - previous_mean,
                round_report["meanNewCards"], places=8
            )
            self.assertGreaterEqual(round_report["cumulativeWins"], previous_wins)
            self.assertEqual(
                round_report["cumulativeWins"] - previous_wins, round_report["firstWins"]
            )
            previous_mean = round_report["meanCumulativeCards"]
            previous_wins = round_report["cumulativeWins"]
        self.assertEqual(
            report["finalHistogram"], report["rounds"][-1]["cumulativeHistogram"]
        )
        lower, upper = report["winProbability95CI"]
        self.assertLessEqual(lower, report["winProbability"] + 1e-11)
        self.assertGreaterEqual(upper, report["winProbability"] - 1e-11)

    def test_all_strategies_histograms_and_records(self):
        for strategy in ["random", "greedy", "round-optimal"]:
            with self.subTest(strategy=strategy), tempfile.TemporaryDirectory() as directory:
                records = Path(directory) / "records.csv"
                output = Path(directory) / "report.json"
                report = run_engine(
                    "simulate", "--strategy", strategy, "--games", 200,
                    "--threads", 2, "--records", records, "--output", output
                )
                self.assert_histogram_consistency(report)
                self.assertEqual(report, json.loads(output.read_text()))
                with records.open() as source:
                    rows = list(csv.DictReader(source))
                self.assertEqual(len(rows), 200)
                self.assertEqual(len({row["game_index"] for row in rows}), 200)
                for round_index in range(3):
                    histogram = [0] * 53
                    incremental = [0] * 53
                    for row in rows:
                        score = int(row[f"round_{round_index + 1}"])
                        previous = int(row[f"round_{round_index}"]) if round_index else 0
                        self.assertGreaterEqual(score, previous)
                        histogram[score] += 1
                        incremental[score - previous] += 1
                    self.assertEqual(histogram, report["rounds"][round_index]["cumulativeHistogram"])
                    self.assertEqual(incremental, report["rounds"][round_index]["incrementalHistogram"])

    def test_thread_count_does_not_change_results(self):
        reports = [
            run_engine("simulate", "--games", 300, "--seed", 918, "--threads", threads)
            for threads in [1, 4]
        ]
        for field in ["rounds", "wins", "finalHistogram", "searchNodes", "finalQuantiles"]:
            self.assertEqual(reports[0][field], reports[1][field])

    def test_disjoint_batches_reproduce_one_run(self):
        whole = run_engine("simulate", "--games", 100, "--threads", 2)
        first = run_engine("simulate", "--games", 40, "--threads", 2)
        second = run_engine("simulate", "--games", 60, "--start-index", 40, "--threads", 2)
        self.assertEqual(
            whole["finalHistogram"],
            [left + right for left, right in zip(first["finalHistogram"], second["finalHistogram"])]
        )

    def test_known_probability_and_absorbing_win(self):
        # One suit, two ranks, one pile: each round wins with probability 1/2.
        # Failure makes no progress. Three independent deals win with 7/8.
        report = run_engine(
            "simulate", "--suits", 1, "--ranks", 2, "--pile-size", 2,
            "--games", 20000, "--threads", 2
        )
        self.assert_histogram_consistency(report)
        self.assertAlmostEqual(report["winProbability"], 7 / 8, delta=0.015)
        for index, round_report in enumerate(report["rounds"]):
            self.assertAlmostEqual(
                round_report["cumulativeWins"] / report["games"],
                1 - 0.5 ** (index + 1), delta=0.015
            )
        guaranteed = run_engine(
            "simulate", "--suits", 2, "--ranks", 3, "--pile-size", 1,
            "--games", 40, "--threads", 1
        )
        self.assertEqual(guaranteed["wins"], 40)
        self.assertEqual(guaranteed["rounds"][0]["firstWins"], 40)
        self.assertEqual(guaranteed["rounds"][1]["incrementalHistogram"][0], 40)
        self.assertEqual(guaranteed["rounds"][2]["incrementalHistogram"][0], 40)

    def test_custom_lock_and_solution(self):
        report = run_engine(
            "solve", "--piles", "9C,JC;QC,KC;TC", "--foundations", "8,13,13,13",
            "--all-outcomes"
        )
        self.assertTrue(report["exact"])
        self.assertEqual(report["maximumCardsThisRound"], 47)
        self.assertEqual(report["outcomes"], [[8, 13, 13, 13]])
        report = run_engine(
            "solve", "--piles", "9C,JC;KC,QC;TC", "--foundations", "8,13,13,13"
        )
        self.assertEqual(report["maximumCardsThisRound"], 52)
        self.assertEqual(report["finalState"]["foundations"], [13] * 4)

    def test_training_frozen_model_and_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory) / "model.txt"
            training = run_engine(
                "train", "--suits", 2, "--ranks", 3,
                "--first-samples", 32, "--second-samples", 16,
                "--threads", 2, "--output", model
            )
            self.assertEqual(training["statesPerDepth"], 10)
            self.assertFalse(training["globallyProvenOptimal"])
            report = run_engine(
                "simulate", "--strategy", "lookahead", "--model", model,
                "--suits", 2, "--ranks", 3, "--games", 100,
                "--threads", 2, "--seed", 700
            )
            self.assert_histogram_consistency(report)
            self.assertFalse(report["optimality"]["globallyProvenOptimal"])
            self.assertEqual(report["optimality"]["truncatedSearches"], 0)
            original = model.read_bytes()
            run_engine(
                "simulate", "--strategy", "lookahead", "--model", model,
                "--suits", 2, "--ranks", 3, "--games", 20, "--threads", 1
            )
            self.assertEqual(model.read_bytes(), original)

    def test_invalid_input_is_rejected(self):
        cases = [
            ["simulate", "--games", "0"], ["simulate", "--threads", "0"],
            ["simulate", "--games", "-1"], ["simulate", "--games", "12x"],
            ["simulate", "--unknown", "5"], ["simulate", "--suits", "4294967297"],
            ["simulate", "--strategy", "magic"],
            ["solve", "--piles", "AC,AC"],
            ["deal", "--foundations", "-1,0,0,0"],
            ["deal", "--foundations", "1x,0,0,0"],
        ]
        for arguments in cases:
            with self.subTest(arguments=arguments):
                result = subprocess.run([str(ENGINE), *arguments], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Error:", result.stderr)

    def test_exact_stochastic_bellman_oracle(self):
        from fractions import Fraction

        model = ExactModel(suits=1, ranks=2, pile_size=2)
        self.assertEqual(model.value((0,), 1)[0], Fraction(1, 2))
        self.assertEqual(model.value((0,), 2)[0], Fraction(3, 4))
        self.assertEqual(model.value((0,), 3)[0], Fraction(7, 8))
        # More cards left can create an extra pile and INCREASE the next-deal
        # win probability. This rules out unsound dominance pruning by score.
        model = ExactModel(suits=2, ranks=3, pile_size=3)
        self.assertEqual(model.value((0, 3), 1)[0], Fraction(1, 6))
        self.assertEqual(model.value((0, 2), 1)[0], Fraction(13, 24))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "exact-model.txt"
            model.save(path)
            expected_probability, expected_cards = model.value((0, 0), 3)
            report = run_engine(
                "simulate", "--suits", 2, "--ranks", 3,
                "--strategy", "lookahead", "--model", path,
                "--games", 20000, "--threads", 2, "--seed", 514
            )
            self.assertAlmostEqual(
                report["winProbability"], float(expected_probability), delta=0.015
            )
            self.assertAlmostEqual(report["meanFinalCards"], float(expected_cards), delta=0.06)

    def test_equal_count_foundation_shape_depends_on_remaining_deals(self):
        from fractions import Fraction

        # Both states have four founded cards in the same two-suit, four-rank
        # game. A universal preference for evenly spread foundations is wrong:
        # the exact preferred shape reverses with the number of future deals.
        model = ExactModel(suits=2, ranks=4, pile_size=3)
        concentrated, balanced = (1, 3), (2, 2)
        self.assertEqual(sum(concentrated), sum(balanced))
        self.assertEqual(model.value(concentrated, 1)[0], Fraction(13, 24))
        self.assertEqual(model.value(balanced, 1)[0], Fraction(1, 2))
        self.assertEqual(model.value(concentrated, 2)[0], Fraction(203, 288))
        self.assertEqual(model.value(balanced, 2)[0], Fraction(3, 4))

    def test_csv_export(self):
        report = run_engine("simulate", "--games", 100, "--threads", 1)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "histograms.csv"
            export_report(report, output)
            with output.open() as source:
                rows = list(csv.DictReader(source))
            self.assertEqual(len(rows), 53 * 7)
            final_rows = [row for row in rows if row["series"] == "final"]
            self.assertEqual(sum(int(row["count"]) for row in final_rows), 100)
            self.assertEqual(float(final_rows[-1]["cdf"]), 1)


if __name__ == "__main__":
    unittest.main()
