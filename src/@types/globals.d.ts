declare const browser: import('webextension-polyfill').Browser;

declare interface Run {
  runId: 0;
  state: string; // "completed";
  reasonCreated: string; // "scheduled";
  reasonResolved: string; // "completed";
  workerGroup: string; // "built-in";
  workerId: string; // "succeed";
  takenUntil: string; // "2023-09-19T20:33:46.188Z";
  scheduled: string; // "2023-09-19T20:13:45.402Z";
  started: string; // "2023-09-19T20:13:46.193Z";
  resolved: string; // "2023-09-19T20:13:46.266Z";
}

declare interface Task {
  status: {
    taskId: string; // "ewZ4vpZbQISjhIPnU3R36g";
    provisionerId: string; // "built-in";
    workerType: string; // "succeed";
    taskQueueId: string; // "built-in/succeed";
    schedulerId: string; // "translations-level-1";
    projectId: string; // "none";
    taskGroupId: string; // "Fo1npr9eTFqsAj4DFlqBbA";
    deadline: string; // "2023-09-24T18:58:07.341Z";
    expires: string; // "2023-10-17T18:58:07.341Z";
    retriesLeft: 5;
    state: string; // "completed";
    runs?: Run[];
  };
  task: {
    provisionerId: string; // "built-in";
    workerType: string; // "succeed";
    taskQueueId: string; // "built-in/succeed";
    schedulerId: string; // "translations-level-1";
    projectId: string; // "none";
    taskGroupId: string; // "Fo1npr9eTFqsAj4DFlqBbA";
    dependencies: string[], // ["CTPPid-iT8WUEzf-j6YKUw", "Fn-77WB6SFKBuQGE62-SMg", ... ]
    requires: string; // "all-completed";
    routes: ["checks"];
    priority: string; // "low";
    retries: 5;
    created: string; // "2023-09-19T18:58:07.341Z";
    deadline: string; // "2023-09-24T18:58:07.341Z";
    expires: string; // "2023-10-17T18:58:07.341Z";
    scopes: [];
    payload: {};
    metadata: {
      name: string; // "all-ru-en";
      owner: string; // "eu9ene@users.noreply.github.com";
      source: string; // "https://github.com/mozilla/firefox-translations-training/blob/773420ae1011f78ef58d375a75c61b65d324aa70/taskcluster/ci/all";
      description: string; // "Dummy task that ensures all parts of training pipeline will run";
    };
    tags: {
      kind: string; // "all";
      label: string; // "all-ru-en";
      createdForUser: string; // "eu9ene@users.noreply.github.com";
      "worker-implementation": string; // "succeed";
    };
    extra: {
      index: { rank: 0 };
      parent: string; // "Fo1npr9eTFqsAj4DFlqBbA";
    };
  };
}

declare interface TaskGroup {
  taskGroupId: string, // "Fo1npr9eTFqsAj4DFlqBbA",
  schedulerId: string, // "translations-level-1",
  expires: string,// "2024-09-18T19:57:56.114Z",
  tasks: Task[],
}
