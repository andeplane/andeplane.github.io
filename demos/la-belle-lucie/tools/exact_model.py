#!/usr/bin/env python3
"""Exact stochastic Bellman oracle for reduced decks, using rational arithmetic.

This deliberately slow, independent implementation enumerates every shuffle and
every legal move. It validates the sampled native model; it is not practical for
a full 52-card deck. No rendering and no third-party dependencies.
"""

import argparse
from fractions import Fraction
from functools import lru_cache
from itertools import combinations_with_replacement, permutations
import json
from math import factorial
from pathlib import Path


class ExactModel:
    def __init__(self, suits, ranks, pile_size):
        if not (1 <= suits <= 4 and 1 <= ranks <= 13 and 1 <= pile_size <= 52):
            raise ValueError("Invalid rules")
        if suits * ranks > 8:
            raise ValueError("Exact shuffle enumeration is limited to eight cards")
        self.suits = suits
        self.ranks = ranks
        self.pile_size = pile_size
        self.card_count = suits * ranks

    @lru_cache(maxsize=None)
    def outcomes(self, piles, foundations):
        """All terminal foundation vectors, without pruning or forced moves."""
        results = set()
        for source, pile in enumerate(piles):
            if not pile:
                continue
            card = pile[-1]
            suit, rank = divmod(card, self.ranks)
            if foundations[suit] == rank:
                next_piles = list(piles)
                next_piles[source] = pile[:-1]
                next_foundations = list(foundations)
                next_foundations[suit] += 1
                results.update(self.outcomes(
                    tuple(sorted(next_piles)), tuple(next_foundations)
                ))
            for destination, target in enumerate(piles):
                if source == destination or not target:
                    continue
                target_suit, target_rank = divmod(target[-1], self.ranks)
                if target_suit == suit and target_rank == rank + 1:
                    next_piles = list(piles)
                    next_piles[source] = pile[:-1]
                    next_piles[destination] = target + (card,)
                    results.update(self.outcomes(tuple(sorted(next_piles)), foundations))
        return frozenset(results or [foundations])

    @lru_cache(maxsize=None)
    def value(self, foundations, rounds_remaining):
        """Lexicographically maximize (win probability, expected final cards)."""
        if sum(foundations) == self.card_count:
            return Fraction(1), Fraction(self.card_count)
        if rounds_remaining == 0:
            return Fraction(0), Fraction(sum(foundations))
        cards = tuple(
            suit * self.ranks + rank
            for suit in range(self.suits)
            for rank in range(foundations[suit], self.ranks)
        )
        total_win_probability = Fraction(0)
        total_final_cards = Fraction(0)
        for shuffled in permutations(cards):
            piles = tuple(sorted(
                shuffled[start:start + self.pile_size]
                for start in range(0, len(shuffled), self.pile_size)
            ))
            candidates = self.outcomes(piles, foundations)
            best = max(
                self.value(tuple(sorted(candidate)), rounds_remaining - 1)
                for candidate in candidates
            )
            total_win_probability += best[0]
            total_final_cards += best[1]
        shuffle_count = factorial(len(cards))
        return total_win_probability / shuffle_count, total_final_cards / shuffle_count

    def save(self, path):
        # Zero sample counts explicitly identify EXACT values in this model format.
        with path.open("w") as output:
            output.write(
                f"KABAL_MODEL_V1 {self.suits} {self.ranks} {self.pile_size} 0 0 0\n"
            )
            for depth in (1, 2):
                for foundations in combinations_with_replacement(range(self.ranks + 1), self.suits):
                    probability, expected_cards = self.value(foundations, depth)
                    key = sum(rank << (4 * suit) for suit, rank in enumerate(foundations))
                    output.write(f"{depth} {key} {float(probability):.17g} {float(expected_cards):.17g}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suits", type=int, default=2)
    parser.add_argument("--ranks", type=int, default=3)
    parser.add_argument("--pile-size", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    model = ExactModel(arguments.suits, arguments.ranks, arguments.pile_size)
    model.save(arguments.output)
    probability, expected_cards = model.value((0,) * arguments.suits, 3)
    print(json.dumps({
        "globallyProvenOptimal": True,
        "scope": f"Reduced deck: {arguments.suits} suits, {arguments.ranks} ranks, three rounds",
        "exactWinProbability": str(probability),
        "winProbability": float(probability),
        "exactExpectedFinalCards": str(expected_cards),
        "meanFinalCards": float(expected_cards),
        "output": str(arguments.output),
    }, indent=2))


if __name__ == "__main__":
    main()
