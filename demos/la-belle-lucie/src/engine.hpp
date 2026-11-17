#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <functional>
#include <numeric>
#include <queue>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace kabal {

constexpr int maximumCards = 52;
constexpr int emptyCard = -1;
constexpr int foundationCard = -2;
constexpr int unusedCard = -3;
using Foundations = std::array<int, 4>;

struct Rules {
    int suits = 4;
    int ranks = 13;
    int pileSize = 3;
    int rounds = 3;
    int cardCount() const { return suits * ranks; }
    void validate() const {
        if (suits < 1 || suits > 4 || ranks < 1 || ranks > 13 || pileSize < 1 ||
            pileSize > maximumCards || rounds < 1 || rounds > 3)
            throw std::invalid_argument("Unsupported rules");
    }
};

// SplitMix64 plus rejection sampling: portable, reproducible and unbiased indices.
class Random {
    uint64_t state;

  public:
    explicit Random(uint64_t seed) : state(seed) {}
    uint64_t next() {
        uint64_t value = (state += 0x9e3779b97f4a7c15ULL);
        value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9ULL;
        value = (value ^ (value >> 27)) * 0x94d049bb133111ebULL;
        return value ^ (value >> 31);
    }
    uint64_t below(uint64_t limit) {
        if (limit == 0)
            throw std::invalid_argument("Empty random range");
        const uint64_t threshold = -limit % limit;
        uint64_t value;
        do {
            value = next();
        } while (value < threshold);
        return value % limit;
    }
};

inline uint64_t streamSeed(uint64_t seed, uint64_t index, uint64_t domain) {
    Random random(seed ^ (index * 0xd1342543de82ef95ULL) ^ domain);
    return random.next();
}

struct Move {
    int card;
    int destination; // -1 means its suit foundation; otherwise the destination card.
    bool operator==(const Move &) const = default;
};

struct State {
    // Each active card points to the card beneath it, or -1 at a pile's base.
    // This representation is independent of pile order in the search key.
    std::array<int8_t, maximumCards> beneath;
    std::array<int8_t, maximumCards> tops;
    Foundations foundations{};
    int pileCount = 0;

    State() {
        beneath.fill(unusedCard);
        tops.fill(emptyCard);
    }
    int score() const { return std::accumulate(foundations.begin(), foundations.end(), 0); }
    std::string key() const {
        return std::string(reinterpret_cast<const char *>(beneath.data()), beneath.size());
    }
    int pileOf(int card) const {
        for (int pile = 0; pile < pileCount; ++pile)
            if (tops[pile] == card)
                return pile;
        return -1;
    }
    std::vector<std::vector<int>> piles() const {
        std::vector<std::vector<int>> result;
        for (int pile = 0; pile < pileCount; ++pile) {
            std::vector<int> cards;
            for (int card = tops[pile]; card >= 0; card = beneath[card])
                cards.push_back(card);
            std::reverse(cards.begin(), cards.end());
            result.push_back(std::move(cards));
        }
        return result;
    }
};

inline State makeState(const Rules &rules, const std::vector<std::vector<int>> &piles,
                       Foundations foundations = {}) {
    rules.validate();
    if (piles.size() > maximumCards)
        throw std::invalid_argument("Too many piles");
    State state;
    state.foundations = foundations;
    std::array<bool, maximumCards> seen{};
    for (int suit = 0; suit < 4; ++suit) {
        if (foundations[suit] < 0 || foundations[suit] > (suit < rules.suits ? rules.ranks : 0))
            throw std::invalid_argument("Invalid foundation rank");
        for (int rank = 0; rank < foundations[suit]; ++rank) {
            int card = suit * rules.ranks + rank;
            state.beneath[card] = foundationCard;
            seen[card] = true;
        }
    }
    state.pileCount = static_cast<int>(piles.size());
    for (int pile = 0; pile < state.pileCount; ++pile) {
        int previous = emptyCard;
        for (int card : piles[pile]) {
            if (card < 0 || card >= rules.cardCount() || seen[card])
                throw std::invalid_argument("Duplicate, founded or invalid card");
            seen[card] = true;
            state.beneath[card] = static_cast<int8_t>(previous);
            previous = card;
        }
        state.tops[pile] = static_cast<int8_t>(previous);
    }
    for (int card = 0; card < rules.cardCount(); ++card)
        if (!seen[card])
            throw std::invalid_argument("A required card is missing");
    return state;
}

inline State deal(const Rules &rules, Foundations foundations, Random &random) {
    std::vector<int> cards;
    for (int suit = 0; suit < rules.suits; ++suit)
        for (int rank = foundations[suit]; rank < rules.ranks; ++rank)
            cards.push_back(suit * rules.ranks + rank);
    for (size_t size = cards.size(); size > 1; --size)
        std::swap(cards[size - 1], cards[random.below(size)]);
    std::vector<std::vector<int>> piles;
    for (size_t start = 0; start < cards.size(); start += rules.pileSize)
        piles.emplace_back(cards.begin() + start,
                           cards.begin() + std::min(cards.size(), start + rules.pileSize));
    return makeState(rules, piles, foundations);
}

inline std::vector<Move> legalMoves(const Rules &rules, const State &state,
                                    bool includeUnproductive = true) {
    std::array<bool, maximumCards> exposed{};
    for (int pile = 0; pile < state.pileCount; ++pile)
        if (state.tops[pile] >= 0)
            exposed[state.tops[pile]] = true;
    std::vector<Move> moves;
    for (int pile = 0; pile < state.pileCount; ++pile) {
        int card = state.tops[pile];
        if (card < 0)
            continue;
        int suit = card / rules.ranks;
        int rank = card % rules.ranks;
        if (state.foundations[suit] == rank)
            moves.push_back({card, -1});
        if (rank + 1 < rules.ranks && exposed[card + 1] &&
            (includeUnproductive || state.beneath[card] >= 0))
            moves.push_back({card, card + 1});
    }
    return moves;
}

inline void applyMove(const Rules &rules, State &state, Move move) {
    if (move.card < 0 || move.card >= rules.cardCount())
        throw std::invalid_argument("Invalid source card");
    int source = state.pileOf(move.card);
    if (source < 0)
        throw std::invalid_argument("Only an exposed card may move");
    if (move.destination == -1) {
        int suit = move.card / rules.ranks;
        if (state.foundations[suit] != move.card % rules.ranks)
            throw std::invalid_argument("Foundation must build upwards in suit");
        state.tops[source] = state.beneath[move.card];
        state.beneath[move.card] = foundationCard;
        ++state.foundations[suit];
    } else {
        if (move.card % rules.ranks + 1 >= rules.ranks || move.destination != move.card + 1)
            throw std::invalid_argument("Tableau must build down one rank in the same suit");
        int destination = state.pileOf(move.destination);
        if (destination < 0 || destination == source)
            throw std::invalid_argument("Destination must be exposed in a different nonempty pile");
        state.tops[source] = state.beneath[move.card];
        state.beneath[move.card] = static_cast<int8_t>(move.destination);
        state.tops[destination] = static_cast<int8_t>(move.card);
    }
}

inline void settleFoundations(const Rules &rules, State &state, std::vector<Move> *path = nullptr) {
    bool changed;
    do {
        changed = false;
        for (int pile = 0; pile < state.pileCount; ++pile) {
            int card = state.tops[pile];
            if (card >= 0 && state.foundations[card / rules.ranks] == card % rules.ranks) {
                Move move{card, -1};
                applyMove(rules, state, move);
                if (path)
                    path->push_back(move);
                changed = true;
            }
        }
    } while (changed);
}

// Only used for maximizing THIS round's score. These moves cannot obstruct
// a useful relocation: their destination either has no card to uncover or
// already sits on its unique successor. They must NOT be used when enumerating
// all possible round outcomes for the stochastic, multi-round objective.
inline void settleSafeMoves(const Rules &rules, State &state, std::vector<Move> *path = nullptr) {
    for (;;) {
        settleFoundations(rules, state, path);
        bool changed = false;
        for (const Move &move : legalMoves(rules, state, false)) {
            if (move.destination < 0)
                continue;
            int beneathDestination = state.beneath[move.destination];
            if (beneathDestination == emptyCard ||
                (move.destination % rules.ranks + 1 < rules.ranks &&
                 beneathDestination == move.destination + 1)) {
                applyMove(rules, state, move);
                if (path)
                    path->push_back(move);
                changed = true;
                break;
            }
        }
        if (!changed)
            return;
    }
}

// Optimistic dependency closure. Exposure and relocation stay available once
// discovered, even when actual play would cover the card again. Consequently
// this can overestimate progress but never underestimate it: a safe search bound.
inline Foundations optimisticFoundations(const Rules &rules, const State &state) {
    std::array<bool, maximumCards> exposed{}, cleared{}, founded{};
    std::array<int, maximumCards> above;
    above.fill(-1);
    for (int card = 0; card < rules.cardCount(); ++card) {
        if (state.beneath[card] == foundationCard) {
            cleared[card] = founded[card] = true;
        }
        if (state.beneath[card] >= 0)
            above[state.beneath[card]] = card;
    }
    bool changed;
    do {
        changed = false;
        for (int card = 0; card < rules.cardCount(); ++card) {
            if (!exposed[card] && (above[card] < 0 || cleared[above[card]])) {
                exposed[card] = true;
                changed = true;
            }
            if (!founded[card] && exposed[card] && (card % rules.ranks == 0 || founded[card - 1])) {
                founded[card] = true;
                changed = true;
            }
            bool canRelocate = card % rules.ranks + 1 < rules.ranks && exposed[card + 1];
            if (!cleared[card] && exposed[card] && (founded[card] || canRelocate)) {
                cleared[card] = true;
                changed = true;
            }
        }
    } while (changed);
    Foundations result{};
    for (int suit = 0; suit < rules.suits; ++suit)
        while (result[suit] < rules.ranks && founded[suit * rules.ranks + result[suit]])
            ++result[suit];
    return result;
}

inline int countFoundations(const Foundations &foundations) {
    return std::accumulate(foundations.begin(), foundations.end(), 0);
}

inline uint32_t encodeFoundations(const Foundations &foundations) {
    uint32_t result = 0;
    for (int suit = 0; suit < 4; ++suit)
        result |= uint32_t(foundations[suit]) << (suit * 4);
    return result;
}

inline Foundations canonicalFoundations(Foundations foundations, int suits = 4) {
    std::sort(foundations.begin(), foundations.begin() + suits);
    return foundations;
}

struct SearchOptions {
    bool allOutcomes = false;
    bool keepPath = false;
    uint64_t maximumNodes = 0; // zero means unlimited; truncation is always reported.
};

struct SearchResult {
    Foundations best{};
    std::vector<Foundations> outcomes;
    std::vector<Move> path;
    uint64_t nodes = 0;
    bool exact = true;
    int upperBound = 0;
};

inline State greedyRound(const Rules &rules, State state, Random *random = nullptr,
                         std::vector<Move> *path = nullptr) {
    for (;;) {
        settleFoundations(rules, state, path);
        auto moves = legalMoves(rules, state, random != nullptr);
        if (moves.empty())
            return state;
        size_t selected = 0;
        if (random)
            selected = random->below(moves.size());
        else {
            auto priority = [&](Move move) {
                int uncovered = state.beneath[move.card];
                if (uncovered < 0)
                    return -1000;
                int missing = uncovered % rules.ranks - state.foundations[uncovered / rules.ranks];
                return 100 - missing * 4 + move.card % rules.ranks;
            };
            for (size_t index = 1; index < moves.size(); ++index)
                if (priority(moves[index]) > priority(moves[selected]))
                    selected = index;
        }
        applyMove(rules, state, moves[selected]);
        if (path)
            path->push_back(moves[selected]);
    }
}

// A card above a required foundation card must be removed first. If it is
// outside the target foundation vector, or follows that buried card in its own
// suit, it cannot reach its foundation first and must make a tableau move.
// Counting these distinct cards gives an admissible remaining-move bound.
inline int requiredTableauMoves(const Rules &rules, const State &state, const Foundations &target) {
    int required = 0;
    for (int card = 0; card < rules.cardCount(); ++card) {
        if (state.beneath[card] < 0)
            continue;
        int suit = card / rules.ranks, rank = card % rules.ranks;
        bool cardRequired = rank < target[suit];
        for (int below = state.beneath[card]; below >= 0; below = state.beneath[below]) {
            int belowSuit = below / rules.ranks, belowRank = below % rules.ranks;
            if (belowRank < target[belowSuit] &&
                (!cardRequired || (belowSuit == suit && belowRank < rank))) {
                ++required;
                break;
            }
        }
    }
    return required;
}

// Score search may force harmless but unnecessary tableau moves. A separate
// A* pass proves the shortest path to ANY maximum-count foundation vector.
// Foundation closure costs zero here: every target-score path has exactly the
// same number of foundation moves. Singleton relocations cannot expose cards
// and can only obstruct a destination, so no shortest path needs them.
inline bool shortestMaximumPath(const Rules &rules, const State &initial, int targetScore,
                                SearchOptions options, SearchResult &result) {
    std::vector<Foundations> targets;
    Foundations target = initial.foundations;
    Foundations upper = optimisticFoundations(rules, initial);
    std::function<void(int, int)> enumerate = [&](int suit, int remaining) {
        if (suit == rules.suits) {
            if (remaining == 0)
                targets.push_back(target);
            return;
        }
        for (int rank = initial.foundations[suit]; rank <= upper[suit] && rank <= remaining;
             ++rank) {
            target[suit] = rank;
            enumerate(suit + 1, remaining - rank);
        }
    };
    enumerate(0, targetScore);

    struct Node {
        State state;
        size_t parent;
        Move move;
        int depth;
    };
    struct Entry {
        int estimate;
        int depth;
        size_t index;
    };
    auto later = [](const Entry &left, const Entry &right) {
        if (left.estimate != right.estimate)
            return left.estimate > right.estimate;
        if (left.depth != right.depth)
            return left.depth < right.depth;
        return left.index > right.index;
    };
    std::priority_queue<Entry, std::vector<Entry>, decltype(later)> pending(later);
    std::vector<Node> nodes;
    std::unordered_map<std::string, int> distance;
    auto enqueue = [&](State state, size_t parent, Move move, int depth) {
        settleFoundations(rules, state);
        std::string key = state.key();
        auto previous = distance.find(key);
        if (previous != distance.end() && previous->second <= depth)
            return;
        Foundations possible = optimisticFoundations(rules, state);
        int lowerBound = maximumCards + 1;
        for (const auto &candidate : targets) {
            bool achievable = true;
            for (int suit = 0; suit < rules.suits; ++suit)
                if (candidate[suit] < state.foundations[suit] || candidate[suit] > possible[suit])
                    achievable = false;
            if (achievable)
                lowerBound = std::min(lowerBound, requiredTableauMoves(rules, state, candidate));
        }
        if (lowerBound > maximumCards)
            return;
        distance[key] = depth;
        nodes.push_back({std::move(state), parent, move, depth});
        pending.push({depth + lowerBound, depth, nodes.size() - 1});
    };
    enqueue(initial, 0, {-1, -1}, 0);
    while (!pending.empty()) {
        Entry entry = pending.top();
        pending.pop();
        // Enqueueing children can reallocate nodes; keep this state by value.
        Node node = nodes[entry.index];
        if (distance.at(node.state.key()) != node.depth)
            continue;
        if (options.maximumNodes && result.nodes >= options.maximumNodes) {
            result.exact = false;
            return false;
        }
        ++result.nodes;
        if (node.state.score() == targetScore) {
            result.best = node.state.foundations;
            if (options.keepPath) {
                std::vector<Move> relocations;
                for (size_t index = entry.index; nodes[index].depth; index = nodes[index].parent)
                    relocations.push_back(nodes[index].move);
                std::reverse(relocations.begin(), relocations.end());
                State replay = initial;
                result.path.clear();
                settleFoundations(rules, replay, &result.path);
                for (Move relocation : relocations) {
                    applyMove(rules, replay, relocation);
                    result.path.push_back(relocation);
                    settleFoundations(rules, replay, &result.path);
                }
            }
            return true;
        }
        auto moves = legalMoves(rules, node.state, false);
        std::stable_sort(moves.begin(), moves.end(), [&](Move left, Move right) {
            return node.state.beneath[left.card] % rules.ranks <
                   node.state.beneath[right.card] % rules.ranks;
        });
        for (Move move : moves) {
            State next = node.state;
            applyMove(rules, next, move);
            enqueue(std::move(next), entry.index, move, node.depth + 1);
        }
    }
    throw std::logic_error("Proven round maximum has no solution path");
}

inline SearchResult searchRound(const Rules &rules, const State &initial,
                                SearchOptions options = {}) {
    SearchResult result;
    result.best = initial.foundations;
    result.upperBound = countFoundations(optimisticFoundations(rules, initial));
    std::unordered_set<std::string> visited;
    std::set<Foundations> outcomes;
    std::vector<Move> path;
    bool provenMaximum = false;
    bool budgetExhausted = false;

    auto record = [&](const State &state) {
        if (options.allOutcomes)
            outcomes.insert(state.foundations);
        if (state.score() > countFoundations(result.best) ||
            (state.score() == countFoundations(result.best) && state.foundations > result.best)) {
            result.best = state.foundations;
            if (options.keepPath)
                result.path = path;
        } else if (options.keepPath && result.path.empty())
            result.path = path;
    };

    std::function<void(State)> visit = [&](State state) {
        if (budgetExhausted)
            return;
        if (provenMaximum && !options.allOutcomes)
            return;
        size_t pathStart = path.size();
        if (options.allOutcomes)
            settleFoundations(rules, state, options.keepPath ? &path : nullptr);
        else
            settleSafeMoves(rules, state, options.keepPath ? &path : nullptr);
        if (!visited.insert(state.key()).second) {
            path.resize(pathStart);
            return;
        }
        ++result.nodes;
        auto moves = legalMoves(rules, state, options.allOutcomes);
        if (moves.empty()) {
            record(state);
            if (state.score() == result.upperBound && !options.allOutcomes)
                provenMaximum = true;
            path.resize(pathStart);
            return;
        }
        if (options.maximumNodes && result.nodes >= options.maximumNodes) {
            result.exact = false;
            State terminal = greedyRound(rules, state, nullptr, options.keepPath ? &path : nullptr);
            record(terminal);
            budgetExhausted = true;
            path.resize(pathStart);
            return;
        }
        if (!options.allOutcomes &&
            countFoundations(optimisticFoundations(rules, state)) < countFoundations(result.best)) {
            path.resize(pathStart);
            return;
        }
        // Try moves uncovering the lowest needed ranks first. Ordering affects
        // speed and deterministic tie breaking, never the exhaustive result.
        std::stable_sort(moves.begin(), moves.end(), [&](Move left, Move right) {
            auto priority = [&](Move move) {
                int uncovered = state.beneath[move.card];
                return uncovered < 0 ? 1000 : uncovered % rules.ranks;
            };
            return priority(left) < priority(right);
        });
        for (Move move : moves) {
            State next = state;
            applyMove(rules, next, move);
            if (options.keepPath)
                path.push_back(move);
            visit(next);
            if (options.keepPath)
                path.pop_back();
            if (provenMaximum && !options.allOutcomes)
                break;
        }
        path.resize(pathStart);
    };
    visit(initial);
    if (options.allOutcomes)
        result.outcomes.assign(outcomes.begin(), outcomes.end());
    else {
        if (result.exact)
            shortestMaximumPath(rules, initial, countFoundations(result.best), options, result);
        result.outcomes.push_back(result.best);
    }
    return result;
}

enum class GameStatus { playing, readyToRedeal, won, lost };

// Rendering-independent game lifecycle. Undo includes redeals, and replaying a
// redeal after undo produces the identical shuffle. The UI can own presentation
// without duplicating legality, round limits or random-number handling.
class Game {
    Rules gameRules;
    State currentState;
    uint64_t gameSeed;
    uint64_t gameIndex;
    int currentRound = 1;
    std::vector<std::pair<State, int>> history;

  public:
    explicit Game(Rules rules = {}, uint64_t seed = 1, uint64_t index = 0)
        : gameRules(rules), gameSeed(seed), gameIndex(index) {
        rules.validate();
        Random random(streamSeed(seed, index, 0x6465616c00000000ULL));
        currentState = deal(gameRules, {}, random);
    }
    const State &state() const { return currentState; }
    const Rules &rules() const { return gameRules; }
    int round() const { return currentRound; }
    std::vector<Move> moves() const { return legalMoves(gameRules, currentState); }
    GameStatus status() const {
        if (currentState.score() == gameRules.cardCount())
            return GameStatus::won;
        if (!moves().empty() &&
            countFoundations(searchRound(gameRules, currentState).best) > currentState.score())
            return GameStatus::playing;
        return currentRound < gameRules.rounds ? GameStatus::readyToRedeal : GameStatus::lost;
    }
    void play(Move move) {
        State next = currentState;
        applyMove(gameRules, next, move);
        history.emplace_back(currentState, currentRound);
        currentState = next;
    }
    void redeal() {
        if (status() != GameStatus::readyToRedeal)
            throw std::invalid_argument(
                "Redeal requires no further foundation progress and at most two redeals");
        history.emplace_back(currentState, currentRound);
        ++currentRound;
        Random random(streamSeed(gameSeed, gameIndex, 0x6465616c00000000ULL + currentRound - 1));
        currentState = deal(gameRules, currentState.foundations, random);
    }
    bool undo() {
        if (history.empty())
            return false;
        currentState = history.back().first;
        currentRound = history.back().second;
        history.pop_back();
        return true;
    }
};

} // namespace kabal
