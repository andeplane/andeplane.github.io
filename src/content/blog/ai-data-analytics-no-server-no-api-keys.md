---
title: "A full AI data-analytics stack with no server and no API keys"
date: "2026-01-18"
description: "An 8B-parameter LLM on WebGPU, CPython and pandas on WebAssembly, and charts — the entire 'chat with your data' stack running inside a single browser tab."
tags: ["LLM", "WebGPU", "Pyodide", "Python", "Privacy"]
---

For a couple of years I'd been carrying around a thesis: *the whole "chat with your data" stack can run in the browser*. Not the UI with an API behind it — **everything**. The language model, the Python runtime, the dataframes, the plotting. Once I noticed that all the pieces had independently become real, I had to try it. That became [AI Data Analytics](https://andeplane.github.io/ai-data-analytics/).

The pieces:

- **[Web-LLM](https://github.com/mlc-ai/web-llm)** runs quantised open-weight models on the GPU via WebGPU. An 8B model — I use Hermes-3-Llama-3.1-8B — generates at usable speed on a normal laptop.
- **Pyodide** is CPython compiled to WebAssembly, with the scientific stack — pandas included — importable like it's just Tuesday.
- **PandasAI** turns a natural-language question over a dataframe into pandas code and runs it.

Stack them and you get something that felt faintly illegal the first time it worked: upload `sales.csv`, type *"which product has the highest return rate?"*, and watch a language model write pandas code that a Python interpreter executes against your dataframe — with no network request anywhere in the loop.

![The whole analytics stack, inside one browser tab](/blog/ai-data-analytics/architecture.svg)

*The network is used exactly once: to download model weights and the Python runtime. After that you can go offline.*

## Why code generation is the right architecture

There's a tempting shortcut: hand the data itself to the LLM and let it answer directly. It's a trap. Models are unreliable at arithmetic over long contexts, your data may not even fit, and you can't audit vibes.

Generating *code* fixes all three at once. The model only sees the schema and a few sample rows — tiny context, no matter how big the file. The arithmetic is done by pandas, which does not hallucinate a groupby. And every answer ships with its own receipt: the code is right there, and a suspicious user can read it.

The loop that makes it actually usable is the retry loop. Generated code fails sometimes — a misspelt column, a type error on a date column. The error message goes straight back to the model for another attempt, entirely client-side. An 8B model with an error-feedback loop lands correct analyses far more often than its raw first-shot rate suggests — asking again is nearly free when there's no API meter running.

Follow-up questions keep the conversation context, so *"now only for 2024"* composes on top of the previous analysis. Charts come back as images rendered from the generated matplotlib figure, tables are sortable, and multiple files can be loaded and joined.

## The trade-offs, honestly

- **The first load is heavy.** Model weights are a multi-gigabyte download; the browser caches them, but the first visit is a coffee break, not a click. That's the price of owning the whole stack.
- **8B is not GPT-class.** It occasionally needs the retry loop, and complex multi-step analyses benefit from being asked as smaller questions. But pandas-code-over-a-schema is a narrow, well-trodden task — small models punch above their weight here.
- **WebGPU is required.** Modern Chrome and Edge are fine, Safari is arriving; older browsers are out of luck.

## Why bother?

Privacy, mostly — and distribution. There is an entire class of tabular data that people rightly refuse to upload: patient lists, payroll, customer exports, anything under NDA. Here the property isn't a promise in a privacy policy, it's an architectural fact: **your data never leaves the device**, and you can verify it with the network tab open.

And because it's just static files, sharing the entire product is sending a URL. No account, no key provisioning, no per-token bill. Anyone with a decent laptop gets a private data analyst for free.

The browser stopped being a thin client somewhere along the way. It has a GPU compute API, a real Python, and enough memory to hold a language model. This project is what happens when you take that literally — and it's the same conviction about browser-native compute that drives [my molecular dynamics experiments](#/blog/webgpu-md-two-million-atoms-in-a-browser-tab): the most interesting deployment target in computing is a tab.
