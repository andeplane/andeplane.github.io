CXX ?= c++
CXXFLAGS = -std=c++20 -O3 -Wall -Wextra -Wpedantic -pthread

.PHONY: all test clean
all: build/kabal

build/kabal: src/main.cpp src/engine.hpp
	mkdir -p build
	$(CXX) $(CXXFLAGS) src/main.cpp -o $@

build/engine-tests: tests/engine_tests.cpp src/engine.hpp
	mkdir -p build
	$(CXX) $(CXXFLAGS) tests/engine_tests.cpp -o $@

test: build/kabal build/engine-tests
	./build/engine-tests
	python3 -m unittest discover -s tests -p 'test_*.py' -v

clean:
	rm -rf build
