#include "engine.hpp"

#include <atomic>
#include <cctype>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <thread>
#include <tuple>

using namespace kabal;

namespace {

struct Arguments {
    std::string command = "help";
    std::map<std::string, std::string> values;
    Arguments(int argc, char **argv) {
        if (argc > 1)
            command = argv[1];
        for (int index = 2; index < argc; ++index) {
            std::string name = argv[index];
            if (!name.starts_with("--"))
                throw std::invalid_argument("Expected an option: " + name);
            name.erase(0, 2);
            if (name == "all-outcomes")
                values[name] = "true";
            else {
                if (++index >= argc)
                    throw std::invalid_argument("Missing value for --" + name);
                values[name] = argv[index];
            }
        }
    }
    std::string text(const std::string &name, std::string fallback = "") const {
        auto found = values.find(name);
        return found == values.end() ? fallback : found->second;
    }
    uint64_t number(const std::string &name, uint64_t fallback) const {
        auto value = text(name);
        if (value.empty())
            return fallback;
        if (value.front() == '-')
            throw std::invalid_argument("Negative --" + name);
        size_t used = 0;
        auto result = std::stoull(value, &used);
        if (used != value.size())
            throw std::invalid_argument("Invalid --" + name);
        return result;
    }
    void validateOptions(const std::set<std::string> &allowed) const {
        for (const auto &[name, value] : values) {
            (void)value;
            if (!allowed.contains(name))
                throw std::invalid_argument("Unknown option --" + name);
        }
    }
};

std::string quote(const std::string &value) {
    std::ostringstream stream;
    stream << '"';
    for (unsigned char character : value) {
        if (character == '"' || character == '\\')
            stream << '\\' << character;
        else if (character < 32)
            stream << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(character)
                   << std::dec;
        else
            stream << character;
    }
    stream << '"';
    return stream.str();
}

template <class Range> void writeArray(std::ostream &stream, const Range &values) {
    stream << '[';
    bool first = true;
    for (const auto &value : values) {
        if (!first)
            stream << ',';
        first = false;
        stream << value;
    }
    stream << ']';
}

void writeRules(std::ostream &stream, const Rules &rules) {
    stream
        << "{\"suits\":" << rules.suits << ",\"ranks\":" << rules.ranks
        << ",\"pileSize\":" << rules.pileSize << ",\"rounds\":" << rules.rounds
        << ",\"emptyPiles\":\"cannot be filled\",\"moves\":\"one exposed card; down one rank in "
           "the same suit\""
           ",\"redeal\":\"shuffle all remaining cards after exhausting moves; retain foundations\""
           ",\"mercyDraw\":false}";
}

void writeState(std::ostream &stream, const State &state) {
    stream << "{\"foundations\":";
    writeArray(stream, state.foundations);
    stream << ",\"piles\":[";
    bool first = true;
    for (const auto &pile : state.piles()) {
        if (!first)
            stream << ',';
        first = false;
        writeArray(stream, pile);
    }
    stream << "],\"pileOrder\":\"buried/base first, exposed card last\"}";
}

Rules readRules(const Arguments &arguments) {
    auto bounded = [&](const std::string &name, uint64_t fallback, uint64_t maximum) {
        uint64_t value = arguments.number(name, fallback);
        if (value < 1 || value > maximum)
            throw std::invalid_argument("Out-of-range --" + name);
        return static_cast<int>(value);
    };
    Rules rules{bounded("suits", 4, 4), bounded("ranks", 13, 13), bounded("pile-size", 3, 52),
                bounded("rounds", 3, 3)};
    rules.validate();
    return rules;
}

std::vector<std::string> split(const std::string &text, char delimiter) {
    std::vector<std::string> result;
    std::istringstream stream(text);
    std::string part;
    while (std::getline(stream, part, delimiter))
        result.push_back(part);
    return result;
}

Foundations readFoundations(const Arguments &arguments) {
    Foundations foundations{};
    if (!arguments.text("foundations").empty()) {
        auto values = split(arguments.text("foundations"), ',');
        if (values.size() != 4)
            throw std::invalid_argument("Provide four foundation ranks: C,D,H,S");
        for (int index = 0; index < 4; ++index) {
            size_t used = 0;
            foundations[index] = std::stoi(values[index], &used);
            if (used != values[index].size())
                throw std::invalid_argument("Invalid foundation rank");
        }
    }
    return foundations;
}

int parseCard(std::string text, const Rules &rules) {
    if (text.size() < 2)
        throw std::invalid_argument("Invalid card: " + text);
    for (char &character : text)
        character = static_cast<char>(std::toupper(static_cast<unsigned char>(character)));
    auto suit = std::string("CDHS").find(text.back());
    text.pop_back();
    int rank = 0;
    if (text == "A")
        rank = 1;
    else if (text == "T")
        rank = 10;
    else if (text == "J")
        rank = 11;
    else if (text == "Q")
        rank = 12;
    else if (text == "K")
        rank = 13;
    else {
        size_t used = 0;
        rank = std::stoi(text, &used);
        if (used != text.size())
            throw std::invalid_argument("Invalid card rank");
    }
    if (suit >= static_cast<size_t>(rules.suits) || rank < 1 || rank > rules.ranks)
        throw std::invalid_argument("Card outside configured deck");
    return static_cast<int>(suit) * rules.ranks + rank - 1;
}

State readState(const Arguments &arguments, const Rules &rules) {
    Foundations foundations = readFoundations(arguments);
    if (arguments.values.contains("piles")) {
        std::vector<std::vector<int>> piles;
        for (const auto &pileText : split(arguments.text("piles"), ';')) {
            std::vector<int> pile;
            for (const auto &cardText : split(pileText, ','))
                pile.push_back(parseCard(cardText, rules));
            piles.push_back(pile);
        }
        return makeState(rules, piles, foundations);
    }
    // Validate foundations before using them to construct a deal.
    for (int suit = 0; suit < 4; ++suit)
        if (foundations[suit] < 0 || foundations[suit] > (suit < rules.suits ? rules.ranks : 0))
            throw std::invalid_argument("Invalid foundation rank");
    Random random(arguments.number("seed", 1));
    return deal(rules, foundations, random);
}

struct Value {
    double winProbability = 0;
    double meanFinalCards = 0;
};

struct Model {
    Rules rules;
    uint64_t firstSamples = 0, secondSamples = 0, seed = 0;
    std::array<std::map<uint32_t, Value>, 3> values;
    Value lookup(int roundsRemaining, Foundations foundations) const {
        if (countFoundations(foundations) == rules.cardCount())
            return {1, double(rules.cardCount())};
        if (roundsRemaining == 0)
            return {0, double(countFoundations(foundations))};
        uint32_t key = encodeFoundations(canonicalFoundations(foundations, rules.suits));
        auto found = values.at(roundsRemaining).find(key);
        if (found == values.at(roundsRemaining).end())
            throw std::runtime_error("Model is missing a continuation state");
        return found->second;
    }
    Foundations choose(int roundsRemaining, const std::vector<Foundations> &outcomes) const {
        if (outcomes.empty())
            throw std::runtime_error("Search returned no outcome");
        Foundations selected = outcomes.front();
        auto utility = [&](Foundations foundations) {
            Value value = lookup(roundsRemaining, foundations);
            return std::tuple(value.winProbability, value.meanFinalCards,
                              countFoundations(foundations), foundations);
        };
        for (Foundations candidate : outcomes)
            if (utility(candidate) > utility(selected))
                selected = candidate;
        return selected;
    }
    void save(const std::string &path) const {
        std::ofstream file(path);
        if (!file)
            throw std::runtime_error("Cannot write model: " + path);
        file << std::setprecision(17) << "KABAL_MODEL_V1 " << rules.suits << ' ' << rules.ranks
             << ' ' << rules.pileSize << ' ' << firstSamples << ' ' << secondSamples << ' ' << seed
             << '\n';
        for (int round = 1; round <= 2; ++round)
            for (const auto &[key, value] : values[round])
                file << round << ' ' << key << ' ' << value.winProbability << ' '
                     << value.meanFinalCards << '\n';
        if (!file)
            throw std::runtime_error("Model write failed");
    }
    static Model load(const std::string &path, const Rules &expectedRules) {
        std::ifstream file(path);
        if (!file)
            throw std::runtime_error("Cannot read model: " + path);
        Model model;
        std::string header;
        file >> header >> model.rules.suits >> model.rules.ranks >> model.rules.pileSize >>
            model.firstSamples >> model.secondSamples >> model.seed;
        if (!file || header != "KABAL_MODEL_V1" || model.rules.suits != expectedRules.suits ||
            model.rules.ranks != expectedRules.ranks ||
            model.rules.pileSize != expectedRules.pileSize)
            throw std::runtime_error("Incompatible model rules or format");
        int round;
        uint32_t key;
        Value value;
        while (file >> round >> key >> value.winProbability >> value.meanFinalCards) {
            if (round < 1 || round > 2 || !std::isfinite(value.winProbability) ||
                value.winProbability < 0 || value.winProbability > 1 ||
                !std::isfinite(value.meanFinalCards) || value.meanFinalCards < 0 ||
                value.meanFinalCards > model.rules.cardCount())
                throw std::runtime_error("Corrupt model value");
            model.values[round][key] = value;
        }
        if (!file.eof())
            throw std::runtime_error("Corrupt model row");
        return model;
    }
};

template <class Function> void parallelFor(uint64_t count, int threadCount, Function function) {
    std::atomic<uint64_t> next{0};
    std::atomic<bool> failed{false};
    std::exception_ptr exception;
    std::mutex exceptionMutex;
    std::vector<std::thread> workers;
    for (int thread = 0; thread < threadCount; ++thread) {
        workers.emplace_back([&, thread] {
            try {
                for (;;) {
                    if (failed.load())
                        return;
                    uint64_t index = next.fetch_add(1);
                    if (index >= count)
                        return;
                    function(index, thread);
                }
            } catch (...) {
                std::lock_guard lock(exceptionMutex);
                if (!exception)
                    exception = std::current_exception();
                failed.store(true);
            }
        });
    }
    for (auto &worker : workers)
        worker.join();
    if (exception)
        std::rethrow_exception(exception);
}

int readThreadCount(const Arguments &arguments) {
    uint64_t count = arguments.number(
        "threads", std::min(8u, std::max(1u, std::thread::hardware_concurrency())));
    if (count < 1 || count > 64)
        throw std::invalid_argument("--threads must be between 1 and 64");
    return static_cast<int>(count);
}

int train(const Arguments &arguments) {
    arguments.validateOptions({"suits", "ranks", "pile-size", "rounds", "seed", "threads",
                               "first-samples", "second-samples", "output"});
    Rules rules = readRules(arguments);
    Model model;
    model.rules = rules;
    model.seed = arguments.number("seed", 90210);
    model.firstSamples = arguments.number("first-samples", 512);
    model.secondSamples = arguments.number("second-samples", 128);
    if (!model.firstSamples || !model.secondSamples || model.firstSamples > 1000000 ||
        model.secondSamples > 1000000)
        throw std::invalid_argument("Training sample counts must be 1..1000000");
    std::string output = arguments.text("output");
    if (output.empty())
        throw std::invalid_argument("train requires --output model.txt");
    std::vector<Foundations> states;
    std::function<void(Foundations, int, int)> enumerate = [&](Foundations foundations, int suit,
                                                               int minimum) {
        if (suit == rules.suits) {
            states.push_back(foundations);
            return;
        }
        for (int rank = minimum; rank <= rules.ranks; ++rank) {
            foundations[suit] = rank;
            enumerate(foundations, suit + 1, rank);
        }
    };
    enumerate({}, 0, 0);
    int threads = readThreadCount(arguments);
    auto start = std::chrono::steady_clock::now();
    for (int round = 1; round <= 2; ++round) {
        std::vector<Value> estimates(states.size());
        uint64_t samples = round == 1 ? model.firstSamples : model.secondSamples;
        std::atomic<uint64_t> completed{0};
        parallelFor(states.size(), threads, [&](uint64_t index, int) {
            Foundations foundations = states[index];
            uint32_t key = encodeFoundations(foundations);
            if (countFoundations(foundations) == rules.cardCount())
                estimates[index] = {1, double(rules.cardCount())};
            else {
                double wins = 0, cards = 0;
                for (uint64_t sample = 0; sample < samples; ++sample) {
                    uint64_t domain = 0x747261696e000000ULL + uint64_t(round) * 65536 + key;
                    Random random(streamSeed(model.seed, sample, domain));
                    State state = deal(rules, foundations, random);
                    if (round == 1) {
                        auto result = searchRound(rules, state);
                        int score = countFoundations(result.best);
                        wins += score == rules.cardCount();
                        cards += score;
                    } else {
                        auto result = searchRound(rules, state, {.allOutcomes = true});
                        Foundations selected = model.choose(1, result.outcomes);
                        Value continuation = model.lookup(1, selected);
                        wins += continuation.winProbability;
                        cards += continuation.meanFinalCards;
                    }
                }
                estimates[index] = {wins / samples, cards / samples};
            }
            uint64_t done = completed.fetch_add(1) + 1;
            if (done % 200 == 0 || done == states.size())
                std::cerr << "Training continuation depth " << round << ": " << done << '/'
                          << states.size() << " states\n";
        });
        for (size_t index = 0; index < states.size(); ++index)
            model.values[round][encodeFoundations(states[index])] = estimates[index];
        // Checkpoint the first completed tier too; an interrupted second tier is distinguishable.
        model.save(output);
    }
    double elapsed =
        std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    std::cout << "{\"model\":" << quote(output) << ",\"statesPerDepth\":" << states.size()
              << ",\"firstSamples\":" << model.firstSamples
              << ",\"secondSamples\":" << model.secondSamples << ",\"seed\":" << model.seed
              << ",\"elapsedSeconds\":" << elapsed
              << ",\"globallyProvenOptimal\":false,\"method\":\"sampled Bellman continuation "
                 "values with exhaustive current-deal choices\"}\n";
    return 0;
}

struct alignas(64) Statistics {
    std::array<std::array<uint64_t, 53>, 3> cumulative{};
    std::array<std::array<uint64_t, 53>, 3> incremental{};
    std::array<uint64_t, 3> firstWin{};
    uint64_t nodes = 0, truncatedSearches = 0, games = 0;
    void add(const Statistics &other) {
        games += other.games;
        nodes += other.nodes;
        truncatedSearches += other.truncatedSearches;
        for (int round = 0; round < 3; ++round) {
            firstWin[round] += other.firstWin[round];
            for (int score = 0; score <= 52; ++score) {
                cumulative[round][score] += other.cumulative[round][score];
                incremental[round][score] += other.incremental[round][score];
            }
        }
    }
};

std::pair<double, double> wilson(uint64_t successes, uint64_t trials) {
    constexpr double z = 1.959963984540054;
    double probability = double(successes) / trials;
    double denominator = 1 + z * z / trials;
    double center = (probability + z * z / (2 * trials)) / denominator;
    double halfWidth =
        z * std::sqrt(probability * (1 - probability) / trials + z * z / (4.0 * trials * trials)) /
        denominator;
    return {std::max(0.0, center - halfWidth), std::min(1.0, center + halfWidth)};
}

double mean(const std::array<uint64_t, 53> &histogram, uint64_t count) {
    double total = 0;
    for (int score = 0; score <= 52; ++score)
        total += score * double(histogram[score]);
    return total / count;
}

int quantile(const std::array<uint64_t, 53> &histogram, uint64_t count, double fraction) {
    uint64_t threshold = std::max(uint64_t(1), uint64_t(std::ceil(count * fraction)));
    uint64_t cumulative = 0;
    for (int score = 0; score <= 52; ++score) {
        cumulative += histogram[score];
        if (cumulative >= threshold)
            return score;
    }
    throw std::runtime_error("Invalid histogram count");
}

int simulate(const Arguments &arguments) {
    arguments.validateOptions({"suits", "ranks", "pile-size", "rounds", "seed", "threads", "games",
                               "strategy", "output", "records", "model", "max-nodes",
                               "start-index"});
    Rules rules = readRules(arguments);
    uint64_t games = arguments.number("games", 10000);
    uint64_t seed = arguments.number("seed", 20261111);
    uint64_t startIndex = arguments.number("start-index", 0);
    uint64_t maximumNodes = arguments.number("max-nodes", 0);
    if (games < 1 || games > 1000000000000ULL || startIndex > UINT64_MAX - games)
        throw std::invalid_argument("Invalid game count or start index");
    std::string strategy = arguments.text("strategy", "round-optimal");
    if (strategy != "random" && strategy != "greedy" && strategy != "round-optimal" &&
        strategy != "lookahead")
        throw std::invalid_argument("Unknown strategy");
    Model model;
    if (strategy == "lookahead")
        model = Model::load(arguments.text("model"), rules);
    int threads = readThreadCount(arguments);
    std::vector<Statistics> partial(threads);
    std::ofstream records;
    std::mutex recordsMutex;
    if (!arguments.text("records").empty()) {
        records.open(arguments.text("records"));
        if (!records)
            throw std::runtime_error("Cannot write records file");
        records << "game_index";
        for (int round = 1; round <= rules.rounds; ++round)
            records << ",round_" << round;
        records << '\n';
    }
    auto start = std::chrono::steady_clock::now();
    std::atomic<uint64_t> completed{0};
    parallelFor(games, threads, [&](uint64_t offset, int thread) {
        uint64_t gameIndex = startIndex + offset;
        Foundations foundations{};
        std::array<int, 3> scores{};
        bool won = false;
        Statistics &statistics = partial[thread];
        for (int round = 0; round < rules.rounds; ++round) {
            int previousScore = countFoundations(foundations);
            if (previousScore < rules.cardCount()) {
                // Deal RNG is independent from policy RNG, training RNG and the
                // number of moves. Future round seeds are never given to search.
                Random dealRandom(streamSeed(seed, gameIndex, 0x6465616c00000000ULL + round));
                State state = deal(rules, foundations, dealRandom);
                if (strategy == "random") {
                    Random policyRandom(streamSeed(seed, gameIndex, 0x706f6c6963790000ULL + round));
                    foundations = greedyRound(rules, state, &policyRandom).foundations;
                } else if (strategy == "greedy")
                    foundations = greedyRound(rules, state).foundations;
                else {
                    bool futureChoices = strategy == "lookahead" && round + 1 < rules.rounds;
                    auto result = searchRound(
                        rules, state, {.allOutcomes = futureChoices, .maximumNodes = maximumNodes});
                    statistics.nodes += result.nodes;
                    statistics.truncatedSearches += !result.exact;
                    foundations = futureChoices
                                      ? model.choose(rules.rounds - round - 1, result.outcomes)
                                      : result.best;
                }
            }
            scores[round] = countFoundations(foundations);
            ++statistics.cumulative[round][scores[round]];
            ++statistics.incremental[round][scores[round] - previousScore];
            if (!won && scores[round] == rules.cardCount()) {
                won = true;
                ++statistics.firstWin[round];
            }
        }
        if (records.is_open()) {
            std::lock_guard lock(recordsMutex);
            records << gameIndex;
            for (int round = 0; round < rules.rounds; ++round)
                records << ',' << scores[round];
            records << '\n';
        }
        ++statistics.games;
        uint64_t done = completed.fetch_add(1) + 1;
        if (done % 100000 == 0)
            std::cerr << "Simulated " << done << '/' << games << " games\n";
    });
    if (records.is_open()) {
        records.flush();
        if (!records)
            throw std::runtime_error("Records write failed");
    }
    Statistics statistics;
    for (const auto &item : partial)
        statistics.add(item);
    double elapsed =
        std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    auto &finalHistogram = statistics.cumulative[rules.rounds - 1];
    uint64_t wins = finalHistogram[rules.cardCount()];
    auto interval = wilson(wins, games);
    std::ostringstream report;
    report << std::setprecision(12)
           << "{\n\"schemaVersion\":1,\n\"engineVersion\":\"1.0.0\",\n\"rules\":";
    writeRules(report, rules);
    report << ",\n\"strategy\":" << quote(strategy) << ",\n\"seed\":" << seed
           << ",\n\"startIndex\":" << startIndex << ",\n\"games\":" << games
           << ",\n\"threads\":" << threads
           << ",\n\"rng\":\"SplitMix64; rejection-sampled Fisher-Yates; independent per-game "
              "per-round streams\""
              ",\n\"optimality\":{\"globallyProvenOptimal\":false,\"description\":";
    std::string description =
        strategy == "round-optimal"
            ? "Exact maximum foundation count in each visible deal, then minimum total moves; "
              "remaining ties use deterministic search order. "
              "Not a proof of optimal three-round win probability."
        : strategy == "lookahead" ? "Exhaustive current-deal terminal choices ranked by sampled, "
                                    "frozen Bellman continuation values. Final round maximizes "
                                    "exact score. Global policy is an approximation."
        : strategy == "random"
            ? "Uniform random legal tableau move after mandatory safe foundation moves."
            : "Heuristic: expose low needed ranks first; no optimality guarantee.";
    report << quote(description) << ",\"searchNodeLimit\":" << maximumNodes
           << ",\"truncatedSearches\":" << statistics.truncatedSearches << "},\n\"wins\":" << wins
           << ",\n\"winProbability\":" << double(wins) / games << ",\n\"winProbability95CI\":["
           << interval.first << ',' << interval.second
           << "],\n\"confidenceMethod\":\"95% Wilson binomial interval; frozen policy, independent "
              "evaluation deals; not a global optimality bound\""
              ",\n\"meanFinalCards\":"
           << mean(finalHistogram, games)
           << ",\n\"meanCompleteness\":" << mean(finalHistogram, games) / rules.cardCount()
           << ",\n\"finalQuantiles\":{\"p05\":" << quantile(finalHistogram, games, .05)
           << ",\"p25\":" << quantile(finalHistogram, games, .25)
           << ",\"median\":" << quantile(finalHistogram, games, .5)
           << ",\"p75\":" << quantile(finalHistogram, games, .75)
           << ",\"p95\":" << quantile(finalHistogram, games, .95) << "},\n\"finalHistogram\":";
    writeArray(report, finalHistogram);
    report << ",\n\"rounds\":[";
    for (int round = 0; round < rules.rounds; ++round) {
        if (round)
            report << ',';
        report << "{\"round\":" << round + 1
               << ",\"meanCumulativeCards\":" << mean(statistics.cumulative[round], games)
               << ",\"meanNewCards\":" << mean(statistics.incremental[round], games)
               << ",\"cumulativeWins\":" << statistics.cumulative[round][rules.cardCount()]
               << ",\"firstWins\":" << statistics.firstWin[round] << ",\"cumulativeHistogram\":";
        writeArray(report, statistics.cumulative[round]);
        report << ",\"incrementalHistogram\":";
        writeArray(report, statistics.incremental[round]);
        report << '}';
    }
    report << "],\n\"searchNodes\":" << statistics.nodes << ",\n\"elapsedSeconds\":" << elapsed
           << ",\n\"gamesPerSecond\":" << games / elapsed;
    if (strategy == "lookahead")
        report << ",\n\"model\":{\"path\":" << quote(arguments.text("model"))
               << ",\"seed\":" << model.seed << ",\"firstSamplesPerState\":" << model.firstSamples
               << ",\"secondSamplesPerState\":" << model.secondSamples
               << ",\"continuationValuesExact\":"
               << (model.firstSamples == 0 && model.secondSamples == 0 ? "true" : "false") << '}';
    report << "\n}\n";
    std::string output = arguments.text("output");
    if (!output.empty()) {
        std::ofstream file(output);
        if (!file)
            throw std::runtime_error("Cannot write report: " + output);
        file << report.str();
        file.flush();
        if (!file)
            throw std::runtime_error("Report write failed");
    }
    std::cout << report.str();
    return 0;
}

int solve(const Arguments &arguments, bool dealOnly) {
    arguments.validateOptions({"suits", "ranks", "pile-size", "rounds", "seed", "foundations",
                               "piles", "all-outcomes", "max-nodes"});
    Rules rules = readRules(arguments);
    State state = readState(arguments, rules);
    std::cout << "{\"rules\":";
    writeRules(std::cout, rules);
    std::cout << ",\"state\":";
    writeState(std::cout, state);
    if (!dealOnly) {
        auto result = searchRound(rules, state,
                                  {.allOutcomes = arguments.values.contains("all-outcomes"),
                                   .keepPath = true,
                                   .maximumNodes = arguments.number("max-nodes", 0)});
        std::cout << ",\"exact\":" << (result.exact ? "true" : "false")
                  << ",\"nodes\":" << result.nodes << ",\"bestFoundations\":";
        writeArray(std::cout, result.best);
        std::cout << ",\"maximumCardsThisRound\":" << countFoundations(result.best)
                  << ",\"optimisticScoreBound\":" << result.upperBound << ",\"outcomes\":[";
        for (size_t index = 0; index < result.outcomes.size(); ++index) {
            if (index)
                std::cout << ',';
            writeArray(std::cout, result.outcomes[index]);
        }
        std::cout << "],\"moves\":[";
        for (size_t index = 0; index < result.path.size(); ++index) {
            if (index)
                std::cout << ',';
            std::cout << "{\"card\":" << result.path[index].card
                      << ",\"destination\":" << result.path[index].destination << '}';
        }
        State replay = state;
        for (Move move : result.path)
            applyMove(rules, replay, move);
        std::cout << "],\"finalState\":";
        writeState(std::cout, replay);
    }
    std::cout << "}\n";
    return 0;
}

} // namespace

int main(int argc, char **argv) {
    try {
        Arguments arguments(argc, argv);
        if (arguments.command == "simulate")
            return simulate(arguments);
        if (arguments.command == "train")
            return train(arguments);
        if (arguments.command == "solve")
            return solve(arguments, false);
        if (arguments.command == "deal")
            return solve(arguments, true);
        if (arguments.command != "help" && arguments.command != "--help")
            throw std::invalid_argument("Unknown command");
        std::cout
            << "Ingrid's solitaire engine\n\n"
               "  kabal simulate --games 1000000 --strategy round-optimal --threads 8 --seed "
               "20261111 --output report.json\n"
               "  kabal train --first-samples 512 --second-samples 128 --threads 8 --output "
               "model.txt\n"
               "  kabal simulate --games 1000000 --strategy lookahead --model model.txt --output "
               "report.json\n"
               "  kabal solve --seed 1 [--all-outcomes]\n"
               "  kabal solve --piles '9C,JC;QC,KC;TC' --foundations 8,13,13,13\n"
               "  kabal deal --seed 1\n\n"
               "Piles: base/buried card first, exposed card last. Suits: C,D,H,S.\n"
               "Card IDs in JSON: suit*ranks+(rank-1). A=1, T=10, J=11, Q=12, K=13.\n"
               "All remaining cards must be supplied exactly once when using --piles.\n"
               "--max-nodes 0 (default) is unlimited. Capped searches are explicitly reported.\n"
               "Reduced test decks: --suits 1..4 --ranks 1..13 --pile-size 1..52 --rounds 1..3.\n";
        return 0;
    } catch (const std::exception &exception) {
        std::cerr << "Error: " << exception.what() << '\n';
        return 1;
    }
}
