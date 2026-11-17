#include "../src/engine.hpp"

#include <iostream>
#include <map>
#include <sstream>

using namespace kabal;

static int assertions = 0;
static void check(bool condition, const std::string &message) {
    ++assertions;
    if (!condition)
        throw std::runtime_error(message);
}

template <class Function> static void rejects(Function function, const std::string &message) {
    bool rejected = false;
    try {
        function();
    } catch (const std::invalid_argument &) {
        rejected = true;
    }
    check(rejected, message);
}

// Intentionally simple, independent reference representation. It performs no
// forced moves, safe-move reductions or optimistic bounds. It enumerates EVERY
// legal move, including unproductive singletons, until no move remains.
struct ReferenceState {
    std::vector<std::vector<int>> piles;
    Foundations foundations{};
    std::string key() const {
        auto sortedPiles = piles;
        std::sort(sortedPiles.begin(), sortedPiles.end());
        std::ostringstream stream;
        for (int value : foundations)
            stream << value << ',';
        for (const auto &pile : sortedPiles) {
            stream << '|';
            for (int card : pile)
                stream << card << ',';
        }
        return stream.str();
    }
};

static std::set<Foundations> referenceOutcomes(const Rules &rules, ReferenceState initial) {
    std::set<Foundations> outcomes;
    std::unordered_set<std::string> visited;
    std::function<void(ReferenceState)> visit = [&](ReferenceState state) {
        if (!visited.insert(state.key()).second)
            return;
        bool hasMove = false;
        for (size_t source = 0; source < state.piles.size(); ++source) {
            if (state.piles[source].empty())
                continue;
            int card = state.piles[source].back();
            int suit = card / rules.ranks, rank = card % rules.ranks;
            if (state.foundations[suit] == rank) {
                auto next = state;
                next.piles[source].pop_back();
                ++next.foundations[suit];
                hasMove = true;
                visit(next);
            }
            for (size_t destination = 0; destination < state.piles.size(); ++destination) {
                if (source == destination || state.piles[destination].empty())
                    continue;
                int target = state.piles[destination].back();
                if (target / rules.ranks == suit && target % rules.ranks == rank + 1) {
                    auto next = state;
                    next.piles[destination].push_back(card);
                    next.piles[source].pop_back();
                    hasMove = true;
                    visit(next);
                }
            }
        }
        if (!hasMove)
            outcomes.insert(state.foundations);
    };
    visit(std::move(initial));
    return outcomes;
}

// Independent breadth-first search counts EVERY card move, including moves
// to foundations. It uses no foundation closure or lower-bound heuristic.
static int referenceMinimumMoves(const Rules &rules, ReferenceState initial, int targetScore) {
    std::vector<std::pair<ReferenceState, int>> pending{{std::move(initial), 0}};
    std::unordered_set<std::string> visited;
    for (size_t index = 0; index < pending.size(); ++index) {
        auto [state, depth] = pending[index];
        if (!visited.insert(state.key()).second)
            continue;
        if (countFoundations(state.foundations) == targetScore)
            return depth;
        for (size_t source = 0; source < state.piles.size(); ++source) {
            if (state.piles[source].empty())
                continue;
            int card = state.piles[source].back();
            int suit = card / rules.ranks, rank = card % rules.ranks;
            if (state.foundations[suit] == rank) {
                auto next = state;
                next.piles[source].pop_back();
                ++next.foundations[suit];
                pending.emplace_back(std::move(next), depth + 1);
            }
            for (size_t destination = 0; destination < state.piles.size(); ++destination) {
                if (source == destination || state.piles[destination].empty())
                    continue;
                int target = state.piles[destination].back();
                if (target / rules.ranks == suit && target % rules.ranks == rank + 1) {
                    auto next = state;
                    next.piles[destination].push_back(card);
                    next.piles[source].pop_back();
                    pending.emplace_back(std::move(next), depth + 1);
                }
            }
        }
    }
    throw std::runtime_error("Reference target is unreachable");
}

static void compareToReference(const Rules &rules, const State &state) {
    auto expected = referenceOutcomes(rules, {state.piles(), state.foundations});
    auto all = searchRound(rules, state, {.allOutcomes = true});
    check(all.exact, "Uncapped outcome enumeration must be exact");
    check(std::set<Foundations>(all.outcomes.begin(), all.outcomes.end()) == expected,
          "Optimized foundation closure must preserve ALL terminal outcomes");
    int expectedMaximum = 0;
    for (const auto &foundations : expected)
        expectedMaximum = std::max(expectedMaximum, countFoundations(foundations));
    auto best = searchRound(rules, state, {.keepPath = true});
    check(best.exact, "Uncapped score search must be exact");
    check(countFoundations(best.best) == expectedMaximum, "Maximum score differs from reference");
    check(best.upperBound >= expectedMaximum, "Dependency bound underestimated the true optimum");
    if (rules.cardCount() <= 9)
        check(static_cast<int>(best.path.size()) ==
                  referenceMinimumMoves(rules, {state.piles(), state.foundations}, expectedMaximum),
              "Maximum-score solution must use the fewest total card moves");
    State replay = state;
    for (Move move : best.path)
        applyMove(rules, replay, move);
    check(replay.foundations == best.best,
          "Returned solution path must replay to its stated result");
}

static void testRules() {
    Rules rules{.suits = 2, .ranks = 3};
    auto state = makeState(rules, {{0, 1}, {2}, {3}, {4}, {5}});
    rejects([&] { applyMove(rules, state, {0, -1}); }, "Buried cards cannot move");
    rejects([&] { applyMove(rules, state, {1, -1}); }, "Two cannot precede its ace");
    rejects([&] { applyMove(rules, state, {1, 5}); }, "Cannot build on a different suit");
    rejects([&] { applyMove(rules, state, {2, 3}); }, "Cannot wrap between suits");
    rejects([&] { applyMove(rules, state, {1, emptyCard}); }, "Empty pile cannot be filled");
    applyMove(rules, state, {1, 2});
    check(state.tops[0] == 0 && state.tops[1] == 1, "Moving two onto three exposes ace");
    applyMove(rules, state, {0, -1});
    applyMove(rules, state, {1, -1});
    applyMove(rules, state, {2, -1});
    check(state.foundations[0] == 3, "Foundation builds ace, two, three");
    check(state.tops[0] == emptyCard && state.tops[1] == emptyCard, "Cleared piles stay empty");
    rejects([&] { makeState(rules, {{0, 0, 1, 2, 3, 4, 5}}); }, "Duplicate card must be rejected");
    rejects([&] { makeState(rules, {{0, 1, 2, 3, 4}}); }, "Missing card must be rejected");
    rejects([&] { makeState(rules, {{1, 2, 3, 4, 5}}, {2, 0, 0, 0}); },
            "Founded card cannot reappear");
}

static void testLocks() {
    Rules rules;
    Foundations foundations{8, 13, 13, 13};
    // Clubs nine behind clubs king: king cannot relocate or reach foundation.
    auto kingLock = makeState(rules, {{8, 12}, {9}, {10}, {11}}, foundations);
    auto result = searchRound(rules, kingLock);
    check(result.best == foundations, "Nine behind its own king is locked");
    check(optimisticFoundations(rules, kingLock) == foundations,
          "Dependency closure detects king lock");

    // Nine behind jack, queen behind king: jack's only parking place is buried.
    auto indirectLock = makeState(rules, {{8, 10}, {11, 12}, {9}}, foundations);
    check(searchRound(rules, indirectLock).best == foundations, "Indirect jack/queen/king lock");
    check(optimisticFoundations(rules, indirectLock) == foundations,
          "Closure propagates indirect lock");

    // Reverse the order of queen and king: jack can park, freeing nine.
    auto unlocked = makeState(rules, {{8, 10}, {12, 11}, {9}}, foundations);
    check(countFoundations(searchRound(rules, unlocked).best) == 52,
          "A genuine escape must not be pruned");
}

static void testUnnecessaryMoves() {
    Rules rules;
    Foundations foundations{2, 13, 13, 13};
    auto state =
        makeState(rules, {{2, 12, 3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}}, foundations);
    check(!legalMoves(rules, state).empty(), "Regression has legal tableau moves");
    auto result = searchRound(rules, state, {.keepPath = true});
    check(result.best == foundations, "Three behind its king cannot reach a foundation");
    check(result.path.empty(), "Do not move four onto five merely to uncover a blocked king");
}

static void testDealsAndSeeds() {
    Rules rules;
    Random first(77), second(77);
    State initial = deal(rules, {}, first);
    check(initial.key() == deal(rules, {}, second).key(), "Same seed reproduces deal");
    check(initial.pileCount == 18, "Full deck deals into 18 piles");
    auto piles = initial.piles();
    for (int index = 0; index < 17; ++index)
        check(piles[index].size() == 3, "First 17 piles have three cards");
    check(piles.back().size() == 1, "Last full-deck pile contains one card");
    State redealt = deal(rules, {1, 2, 3, 4}, first);
    check(redealt.score() == 10, "Redeal preserves foundations");
    int remaining = 0;
    for (const auto &pile : redealt.piles())
        remaining += static_cast<int>(pile.size());
    check(remaining == 42, "Only remaining cards are redealt");
    check(deal(rules, {13, 13, 13, 13}, first).pileCount == 0, "Won game has no tableau cards");
    auto reordered = initial.piles();
    std::reverse(reordered.begin(), reordered.end());
    check(makeState(rules, reordered).key() == initial.key(), "Search key ignores pile order");
}

static void testExhaustiveSmallDecks() {
    for (Rules rules : {Rules{.suits = 2, .ranks = 3}, Rules{.suits = 3, .ranks = 2}}) {
        std::vector<int> cards(rules.cardCount());
        std::iota(cards.begin(), cards.end(), 0);
        do {
            std::vector<std::vector<int>> piles;
            for (size_t start = 0; start < cards.size(); start += rules.pileSize)
                piles.emplace_back(cards.begin() + start,
                                   cards.begin() + std::min(cards.size(), start + rules.pileSize));
            compareToReference(rules, makeState(rules, piles));
        } while (std::next_permutation(cards.begin(), cards.end()));
    }
    Random random(343);
    Rules rules{.suits = 3, .ranks = 3};
    for (int index = 0; index < 300; ++index) {
        Foundations foundations{};
        for (int suit = 0; suit < rules.suits; ++suit)
            foundations[suit] = static_cast<int>(random.below(4));
        compareToReference(rules, deal(rules, foundations, random));
    }
}

static void testFullDecksAndBranching() {
    Rules rules;
    Random random(724);
    bool distinctOutcomes = false;
    for (int index = 0; index < 20; ++index) {
        State state = deal(rules, {}, random);
        auto all = searchRound(rules, state, {.allOutcomes = true});
        auto best = searchRound(rules, state, {.keepPath = true});
        int maximum = 0;
        for (const auto &foundations : all.outcomes)
            maximum = std::max(maximum, countFoundations(foundations));
        check(countFoundations(best.best) == maximum,
              "Full-deck maximum agrees with complete enumeration");
        distinctOutcomes |= all.outcomes.size() > 1;
        auto replay = state;
        for (Move move : best.path)
            applyMove(rules, replay, move);
        check(replay.foundations == best.best, "Full-deck solution replay");
        if (index < 3)
            compareToReference(rules, state);
    }
    check(distinctOutcomes, "Tests exercise strategically different terminal outcomes");
    Random capRandom(34);
    bool observedTruncation = false;
    for (int index = 0; index < 20; ++index)
        observedTruncation |= !searchRound(rules, deal(rules, {}, capRandom),
                                           {.allOutcomes = true, .maximumNodes = 1})
                                   .exact;
    check(observedTruncation, "A search cap must be disclosed");
}

static void testGameLifecycle() {
    Rules rules{.suits = 1, .ranks = 2, .pileSize = 2};
    bool exercisedLoss = false, exercisedWin = false, exercisedRedealUndo = false;
    for (uint64_t seed = 0; seed < 100; ++seed) {
        Game game(rules, seed);
        check(game.round() == 1, "Game starts in round one");
        check(!game.undo(), "Cannot undo before the first action");
        for (int action = 0; action < 20; ++action) {
            if (game.status() == GameStatus::won) {
                exercisedWin = true;
                rejects([&] { game.redeal(); }, "Cannot redeal a won game");
                break;
            }
            if (game.status() == GameStatus::lost) {
                exercisedLoss = true;
                check(game.round() == 3, "Loss occurs only in the third round");
                rejects([&] { game.redeal(); }, "A fourth round is forbidden");
                break;
            }
            if (game.status() == GameStatus::readyToRedeal) {
                auto before = game.state();
                int previousRound = game.round();
                game.redeal();
                auto after = game.state();
                check(game.undo(), "Can undo a redeal");
                check(game.round() == previousRound && game.state().key() == before.key(),
                      "Undo restores both the round and tableau");
                game.redeal();
                check(game.state().key() == after.key(),
                      "Replaying a redeal preserves its random outcome");
                exercisedRedealUndo = true;
            } else {
                rejects([&] { game.redeal(); }, "Cannot redeal while legal moves remain");
                auto before = game.state();
                Move move = game.moves().front();
                game.play(move);
                auto after = game.state();
                check(game.undo() && game.state().key() == before.key(), "Can undo a card move");
                game.play(move);
                check(game.state().key() == after.key(), "Replaying a card move preserves state");
            }
        }
    }
    check(exercisedLoss && exercisedWin && exercisedRedealUndo,
          "Lifecycle checks cover wins, final losses and undoing a redeal");
}

int main() {
    try {
        testRules();
        testLocks();
        testUnnecessaryMoves();
        testDealsAndSeeds();
        testExhaustiveSmallDecks();
        testFullDecksAndBranching();
        testGameLifecycle();
        std::cout << "PASS: " << assertions
                  << " assertions, including 1,440 exhaustive deals, "
                     "300 random reduced-deck states and full-deck cross-checks.\n";
    } catch (const std::exception &exception) {
        std::cerr << "FAIL after " << assertions << " assertions: " << exception.what() << '\n';
        return 1;
    }
}
