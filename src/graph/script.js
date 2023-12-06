// @ts-check

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement("taskGroup")),
  mergeChunks: /** @type {HTMLInputElement} */ (getElement("mergeChunks")),
  graph: getElement("graph"),
  info: getElement("info"),
  infoMessage: getElement("info-message"),
}

setupHandlers()
getTasks()
  .then(render).catch(error => console.error(error))

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function getElement(id) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error("Could not find element " + id);
  }
  return element;
}

/**
 * @param {URLSearchParams} urlParams
 */
function changeLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;

  // @ts-ignore
  window.location = newLocation
}

function setupHandlers() {
  elements.taskGroup.addEventListener('keydown', (event) => {
    const taskGroupId = /** @type {HTMLInputElement } */ elements.taskGroup.value
    if (event.key === 'Enter' && taskGroupId) {
      if (!isTaskGroupIdValid(taskGroupId)) {
        alert("The task group id was not valid")
        return;
      }
      const ids = getTaskGroupIds()
      ids.push(taskGroupId);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','))
      changeLocation(urlParams)
    }
  });

  elements.mergeChunks.checked = isMergeChunks()
  elements.mergeChunks.addEventListener("click", () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('mergeChunks', elements.mergeChunks.checked.toString())
    changeLocation(urlParams)
  })
}

/**
 * Should the task chunks be merged?
 *
 * @returns {boolean}
 */
function isMergeChunks() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("mergeChunks") === "true"
}

/**
 * @param {string} id
 */
function isTaskGroupIdValid(id) {
  return id.match(/^[a-zA-Z0-9_-]+$/)
}

/**
 * @returns {string[]}
 */
function getTaskGroupIds() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupIdParam = urlParams.get('taskGroupIds');

  // "PuI6mYZPTUqAfyZMTgeUng", "S5E71GihQM6Te_KdrUmATw"

  if (!taskGroupIdParam) {
    return [];
  }

  // Parse the taskGroupId values into an array
  const taskGroupIds = taskGroupIdParam.split(',');
  console.log(taskGroupIds);
  return taskGroupIds
}

/**
 * @returns {Promise<Task[]>}
 */
async function getTasks() {
  const taskGroupIds = getTaskGroupIds();

  // Validate the taskGroupIds
  if (taskGroupIds.length && taskGroupIds.some(id => !isTaskGroupIdValid(id))) {
    const p = document.createElement("p")
    p.innerText = "A task group id was not valid, " + JSON.stringify(taskGroupIds)
    document.body.appendChild(p)
    throw new Error(p.innerText);
  }

  console.log("Using the following taskGroupIds", taskGroupIds);

  elements.infoMessage.innerText = "Fetching the tasks…"

  /** @type {Array<Promise<TaskGroup>>} */
  const taskGroupPromises = taskGroupIds.map(id =>
    fetch(`https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task-group/${id}/list`)
      .then((response) => response.json())
  );

  const combinedTasks = []
  for (const {tasks} of await Promise.all(taskGroupPromises)) {
    for (const task of tasks) {
      combinedTasks.push(task)
    }
  }

  if (!isMergeChunks()) {
    return combinedTasks;
  }

  const mergedTasks = [];
  const labelToTask = new Map();
  const taskIdToMergedId = new Map();
  for (const task of combinedTasks) {
    const { label } = task.task.tags
    const chunkResult = label?.match(/(.*)-\d+\/\d+$/);
    if (chunkResult) {
      const newLabel = chunkResult[1];
      const existingTask = labelToTask.get(newLabel);
      if (existingTask) {
        existingTask
      } else {
        task.task.tags.label = newLabel;
        labelToTask.set(newLabel, task);
      }
    }
  }
}

/**
 * @param {Task[]} tasks
 */
function render(tasks) {
  if (tasks.length === 0) {
    return;
  }
  elements.info.style.display = "none"

  // Specify the dimensions of the chart.
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Specify the color scale.
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  /**
   * Returns the first part of a task name, e.g. "clean-mono" returns "clean"
   * @param {Task} task
   */
  function getTaskType(task) {
    return task.task.tags.label?.split("-")[0] ?? ""
  }

  const types = [...new Set(tasks.map(task => getTaskType(task)))]

  /**
   * This node function exists so that Typescript can infer the type.
   * @param {Task} task
   */
  function makeNode(task) {
    const { runs } = task.status;
    if (!runs) {
      throw new Error("Expected a run.");
    }
    const start = new Date(runs[0].started).valueOf();
    const end = new Date(runs[0].resolved).valueOf();
    const duration = end - start;

    const label = task.task.tags.label ?? task.task.metadata.name
    const tag = getTaskType(task);

    return {
      id: task.status.taskId,
      x: Math.random() * width,
      y: Math.random() * height,
      duration,
      label,
      start,
      end,
      dependencies: task.task.dependencies,
      group: types.findIndex(type => type === tag),
    };
  }

  /**
   * @typedef {ReturnType<makeNode>} Node
   */

  /** @type {Array<Node | null>} */
  const nodesMaybe = tasks.map((task) => {
    const { runs } = task.status;
    if (!runs || !runs.length || !runs[0].started || !runs[0].resolved) {
      return null;
    }
    return makeNode(task)
  });

  // For some reason typescript isn't inferring the filter correctly, but this does
  // the trick.
  const nodes = nodesMaybe.filter(node => node !== null).map(node => {
    if (!node) {
      throw new Error("Node found when not expected.");
    }
    return node
  })

  /** @type {number[]} */
  const durations = nodes.map((node) => node.duration);
  const starts = nodes.map((node) => node.start);
  const ends = nodes.map((node) => node.end);

  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const minStart = Math.min(...starts)
  const maxStart = Math.max(...starts)
  const endRange = Math.max(...ends)
  const totalDuration = endRange - minStart

  const links = nodes.flatMap((node) =>
    node.dependencies
      .filter((dependency) => nodes.some((node) => node.id === dependency))
      .map((dependency) => ({
        source: node.id,
        target: dependency,
      })),
  );

  /**
   * @typedef {d3.SimulationNodeDatum} SimulationNodeDatum
   */

  /**
   * Work around a type definition issue.
   * @param {(node: Node) => any} callback
   * @returns {(d: d3.SimulationNodeDatum) => any}
   */
  function dAsNode(callback) {
    /** @type {any} */
    const anyCallback = callback
    return anyCallback;
  }

  // Create a simulation with several forces.
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links).id(dAsNode((d) => d.id))
        .distance((d) => {
          const sourceNode = nodes.find((node) => node.id === d.source.id);
          const targetNode = nodes.find((node) => node.id === d.target.id);
          if (!sourceNode) {
            throw new Error("Could not find source node.");
          }
          if (!targetNode) {
            throw new Error("Could not find source node.");
          }
          const totalDuration = maxDuration - minDuration
          const averageDuration = (sourceNode.duration + targetNode.duration) / totalDuration;
          return 10 + 300 * averageDuration; // Adjust the base distance and factor as needed.
        }),
    )
    .force("charge", d3.forceManyBody())
    .force("forceX", d3.forceX(dAsNode(d => {
      const margin = 0.2
      const duration = maxStart - minStart
      return width * margin + (d.start - minStart) / duration * (width * (1 - margin * 2));
    })).strength(0.08))
    // })
    .force("forceY", d3.forceY(height/2).strength(0.08) )
    .on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => {
          const radius = getNodeRadius(d.target) + 3
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx ** 2 + dy ** 2)
          const t = (dist - radius) / dist
          return d.source.x + t * dx;
        })
        .attr("y2", (d) => {
          const radius = getNodeRadius(d.target) + 3
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx ** 2 + dy ** 2)
          const t = (dist - radius) / dist
          return d.source.y + t * dy;
        });

      label
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    });

  // Create the SVG container.
  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto;");

  /**
   * @param {Node} d
   */
  function getNodeRadius(d) {
    const range = maxDuration - minDuration;
    return 7 + (d.duration / range) * 30;
  }

  // Add a line for each link, and a circle for each node.
  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll()
    .data(links)
    .join("line")
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#arrowhead)");

  const node = svg
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .selectAll()
    .data(nodes)
    .join("circle")
    .attr("r", getNodeRadius)
    .attr("fill", (d) => color(d.group))
    .on("mouseover", (event, d) => {
      label.filter(labelD => labelD.id === d.id).style("opacity", 1);
    })
    .on("mouseout", (event, d) => {
      label.filter(labelD => labelD.id === d.id).style("opacity", 0);
    });

  // Add a drag behavior.
  node.call(
    d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended),
  );

  const label = svg
     .selectAll(null)
     .data(nodes)
     .enter()
     .append("text")
     .text((d) => d.label)
     .attr("font-size", 12)
     .attr("dx", 15)
     .attr("dy", 4)
     .style("pointer-events", "none")
     .style("opacity", 0)
     .style("font-family", "sans-serif")
     .style("filter", "url(#solid)");

    svg
     .append("defs")
     .html(`
       <marker id="arrowhead" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto">
         <path d="M0,-5L10,0L0,5" fill="#999" />
       </marker>
     `);


  // Reheat the simulation when drag starts, and fix the subject position.
  function dragstarted(event) {
    if (!event.active) {
      simulation.alphaTarget(0.3).restart();
    }
  }

  // Update the subject (dragged node) position during drag.
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  // Restore the target alpha so the simulation cools after dragging ends.
  // Unfix the subject position now that it’s no longer being dragged.
  function dragended(event) {
    // if (!event.active) simulation.alphaTarget(0);
    // event.subject.fx = null;
    // event.subject.fy = null;
  }

  // Reorder nodes and labels
  svg.selectAll("text").raise();

  svg.append("defs")
    .html(`
      <filter x="0" y="0" width="1" height="1" id="solid">
        <feFlood flood-color="white" result="bg" />
        <feMerge>
          <feMergeNode in="bg"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `);


  elements.graph.appendChild(svg.node());
}
