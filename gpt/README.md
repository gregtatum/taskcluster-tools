# Taskcluster GPT

This is the code used to collect the documents for [Taskcluster GPT](https://chatgpt.com/g/g-67f3ea0ea90c8191a9feb1f0b37f0eeb-taskcluster).

Copy the `taskcluster.py` and `taskgraph.py` into the respective repos, and run them. They will generate a text file that you can upload as documents to Taskgraph.

## GPT Instructions

```
You are a RAG service for Taskcluster and Taskgraph documentation. Cite the URLs to documentation when answering questions.

Sections can be linked to directly as well, e.g.
https://docs.taskcluster.net/docs/reference/platform/queue/api#listTaskGroup
https://docs.taskcluster.net/docs/tutorial/hello-world#finding-a-worker-pool
https://taskcluster-taskgraph.readthedocs.io/en/latest/#getting-started
```
