// graphRenderer.js - Module for rendering the D3 graph

import * as d3 from 'd3';

const GRAPH_CONFIG = {
    nodeRadius: 10,
    linkDistance: 200,
    chargeStrength: -500,
    centerForceStrength: 0.1,
    collideRadius: 40,
    zoomExtent: [0.1, 10],
    transitionDuration: 750,
    labelFontSize: "12px",
    labelDx: 12,
    labelDy: 4,
    colors: {
        element: "blue",
        script: "red",
        stylesheet: "green",
        "external-style": "green",
        "inline-style": "orange",
        "game-element": "purple",
        function: "pink",
        input: "yellow",
        variable: "magenta",
        default: "gray"
    },
    linkColors: {
        input: "yellow",
        output: "orange",
        "style-use": "green",
        "element-use": "cyan",
        "function-call": "purple",
        "variable-use": "magenta",
        "js-style-mod": "magenta",
        default: "white"
    }
};

/**
 * Renders the D3 graph with nodes and links.
 * @param {Array} nodes - Array of node objects.
 * @param {Array} links - Array of link objects.
 * @param {Map} scriptContentMap - Map of script contents.
 */
export function renderGraph(nodes, links, scriptContentMap) {
    const svg = d3.select("svg");
    svg.selectAll("*").remove();
    const width = document.getElementById('graph-container').clientWidth;
    const height = document.getElementById('graph-container').clientHeight;

    const g = svg.append("g");
    const zoom = d3.zoom()
        .scaleExtent(GRAPH_CONFIG.zoomExtent)
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(GRAPH_CONFIG.linkDistance))
        .force("charge", d3.forceManyBody().strength(GRAPH_CONFIG.chargeStrength))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(GRAPH_CONFIG.collideRadius))
        .force("x", d3.forceX(width / 2).strength(GRAPH_CONFIG.centerForceStrength))
        .force("y", d3.forceY(height / 2).strength(GRAPH_CONFIG.centerForceStrength));

    let focusedNodeId = null;
    let hasClickedEmptySpace = false;

    const link = g.append("g")
        .selectAll("g")
        .data(links)
        .join("g")
        .attr("class", d => d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod" ? "dynamic-link" : "static-link");

    link.append("line")
        .attr("stroke", d => GRAPH_CONFIG.linkColors[d.type] || GRAPH_CONFIG.linkColors.default)
        .attr("stroke-width", 1.5)
        .attr("marker-end", "url(#arrow)")
        .style("visibility", "visible");

    svg.append("defs").append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "white");

    link.append("text")
        .attr("class", "link-label")
        .attr("dy", -5)
        .text(d => d.label || (d.type === "input" ? "Input" : d.type === "output" ? "Output" : d.type === "style-use" ? "Style Use" : d.type === "element-use" ? "Element Use" : d.type === "function-call" ? d.label : d.type === "variable-use" || d.type === "js-style-mod" ? d.label : ""))
        .style("visibility", "visible");

    const node = g.append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", GRAPH_CONFIG.nodeRadius)
        .attr("fill", d => GRAPH_CONFIG.colors[d.type] || GRAPH_CONFIG.colors.default)
        .on("click", (event, d) => handleNodeClick(event, d, width, height, svg, scriptContentMap))
        .call(d3.drag()
            .on("start", dragStart)
            .on("drag", dragging)
            .on("end", dragEnd));

    svg.on("click", (event) => handleSvgClick(event, svg));

    const labels = g.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("fill", "white")
        .attr("font-size", GRAPH_CONFIG.labelFontSize)
        .attr("dx", GRAPH_CONFIG.labelDx)
        .attr("dy", GRAPH_CONFIG.labelDy)
        .text(d => d.name);

    simulation.on("tick", () => {
        link.select("line")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        link.select("text")
            .attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);

        node.attr("cx", d => d.x)
            .attr("cy", d => d.y);

        labels.attr("x", d => d.x)
            .attr("y", d => d.y);
    });

    function handleNodeClick(event, d, width, height, svg, scriptContentMap) {
        event.stopPropagation();
        const detailsPanel = document.getElementById('details-panel');
        const detailsContent = document.getElementById('details-content');
        detailsPanel.style.display = "block";
        focusedNodeId = d.id;
        hasClickedEmptySpace = false;
        if (d.type === "function") {
            detailsContent.textContent = d.content || "No function code available";
            const scale = 2;
            const x = -d.x * scale + width / 2;
            const y = -d.y * scale + height / 2;
            svg.transition().duration(GRAPH_CONFIG.transitionDuration).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        } else if (d.type === "script") {
            detailsContent.textContent = scriptContentMap.get(d.id) || "External script or no content";
        } else if (d.type === "element" || d.type === "game-element" || d.type === "stylesheet" || d.type === "external-style" || d.type === "inline-style") {
            detailsContent.textContent = d.content || `${d.name} (No additional details)`;
        } else {
            detailsContent.textContent = `${d.name} (Type: ${d.type})`;
        }
        updateVisibility();
    }

    function handleSvgClick(event, svg) {
        if (event.target.tagName === "svg") {
            const detailsPanel = document.getElementById('details-panel');
            const detailsContent = document.getElementById('details-content');
            svg.transition().duration(GRAPH_CONFIG.transitionDuration).call(zoom.transform, d3.zoomIdentity);
            detailsPanel.style.display = "none";
            detailsContent.textContent = "";
            focusedNodeId = null;
            hasClickedEmptySpace = true;
            updateVisibility();
        }
    }

    function updateVisibility() {
        const connectedNodeIds = new Set();
        if (focusedNodeId !== null) {
            connectedNodeIds.add(focusedNodeId);
            links.forEach(link => {
                if (link.source.id === focusedNodeId) {
                    connectedNodeIds.add(link.target.id);
                    if (link.type === "element-use" || link.type === "style-use" || link.type === "variable-use" || link.type === "js-style-mod") link.visible = true;
                } else if (link.target.id === focusedNodeId) {
                    connectedNodeIds.add(link.source.id);
                    if (link.type === "element-use" || link.type === "style-use" || link.type === "variable-use" || link.type === "js-style-mod") link.visible = true;
                } else if (link.type === "element-use" || link.type === "style-use" || link.type === "variable-use" || link.type === "js-style-mod") {
                    link.visible = false;
                } else if (link.type === "function-call") {
                    if (link.source.id === focusedNodeId) {
                        connectedNodeIds.add(link.target.id);
                    }
                }
            });
        } else if (hasClickedEmptySpace) {
            links.forEach(link => {
                if (link.type === "element-use" || link.type === "style-use" || link.type === "variable-use" || link.type === "js-style-mod") {
                    link.visible = false;
                }
            });
        }

        node.style("visibility", d => focusedNodeId === null || connectedNodeIds.has(d.id) ? "visible" : "hidden");
        labels.style("visibility", d => focusedNodeId === null || connectedNodeIds.has(d.id) ? "visible" : "hidden");

        link.select("line")
            .style("visibility", d => {
                if (d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod") {
                    return d.visible ? "visible" : "hidden";
                }
                if (d.type === "function-call") {
                    return focusedNodeId !== null && d.source.id === focusedNodeId ? "visible" : "hidden";
                }
                return focusedNodeId === null || (d.source.id === focusedNodeId || d.target.id === focusedNodeId) ? "visible" : "hidden";
            })
            .style("opacity", d => {
                if (focusedNodeId === null && !hasClickedEmptySpace && (d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod")) {
                    return 0.3;
                }
                return 1;
            });

        link.select("text")
            .style("visibility", d => {
                if (d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod") {
                    return d.visible ? "visible" : "hidden";
                }
                if (d.type === "function-call") {
                    return focusedNodeId !== null && d.source.id === focusedNodeId ? "visible" : "hidden";
                }
                return focusedNodeId === null || (d.source.id === focusedNodeId || d.target.id === focusedNodeId) ? "visible" : "hidden";
            })
            .style("opacity", d => {
                if (focusedNodeId === null && !hasClickedEmptySpace && (d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod")) {
                    return 0.3;
                }
                return 1;
            });

        simulation.alpha(0.1).restart();
    }

    function dragStart(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragging(event, d) {
        const transform = d3.zoomTransform(svg.node());
        d.fx = (event.x - transform.x) / transform.k;
        d.fy = (event.y - transform.y) / transform.k;
    }

    function dragEnd(event, d) {
        if (!event.active) simulation.alphaTarget(0.1);
        d.fx = null;
        d.fy = null;
    }

    updateVisibility();
}