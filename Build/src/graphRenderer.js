// graphRenderer.js - Module for rendering the D3 graph

import * as d3 from 'd3';

const GRAPH_CONFIG = {
    nodeRadius: 8,
    focusedNodeRadius: 12,
    linkDistance: 150,
    chargeStrength: -400,
    centerForceStrength: 0.05,
    collideRadius: 35,
    zoomExtent: [0.1, 10],
    transitionDuration: 750,
    labelFontSize: "11px",
    labelDx: 14,
    labelDy: 4,
    strokeWidth: {
        default: 1.5,
        focused: 2.5,
        dimmed: 1
    },
    opacity: {
        default: 1,
        dimmed: 0.15,
        hidden: 0.05
    },
    colors: {
        element: "#3b82f6",        // blue
        script: "#ef4444",          // red
        stylesheet: "#10b981",      // green
        "external-style": "#059669", // darker green
        "inline-style": "#f59e0b",  // orange
        "game-element": "#8b5cf6",  // purple
        function: "#ec4899",        // pink
        input: "#eab308",           // yellow
        output: "#f97316",          // orange
        variable: "#d946ef",        // magenta
        "dom-change": "#06b6d4",    // cyan
        default: "#6b7280"          // gray
    },
    linkColors: {
        structural: "#b4bac4ff",      // gray
        input: "#eab308",           // yellow
        output: "#f97316",          // orange
        "style-use": "#10b981",     // green
        "stylesheet-use": "#10b981", // green
        "element-use": "#06b6d4",   // cyan
        "function-call": "#8b5cf6", // purple
        "variable-use": "#d946ef",  // magenta
        "js-style-mod": "#d946ef",  // magenta
        default: "#e1e4e9ff"          // light gray
    }
};

// Dynamic link types that are hidden by default
const DYNAMIC_LINK_TYPES = new Set([
    "element-use",
    "style-use",
    "stylesheet-use",
    "variable-use",
    "js-style-mod"
]);

export function renderGraph(nodes, links, scriptContentMap) {
    // Clear and setup SVG
    const svg = d3.select("svg");
    svg.selectAll("*").remove();

    const container = document.getElementById('graph-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create main group for zoom/pan
    const g = svg.append("g");

    // Setup zoom behavior
    const zoom = d3.zoom()
        .scaleExtent(GRAPH_CONFIG.zoomExtent)
        .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Create force simulation with improved parameters
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.id)
            .distance(d => {
                // Shorter links for structural relationships
                if (d.type === "structural") return GRAPH_CONFIG.linkDistance * 0.6;
                return GRAPH_CONFIG.linkDistance;
            }))
        .force("charge", d3.forceManyBody()
            .strength(GRAPH_CONFIG.chargeStrength))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(GRAPH_CONFIG.collideRadius))
        .force("x", d3.forceX(width / 2)
            .strength(GRAPH_CONFIG.centerForceStrength))
        .force("y", d3.forceY(height / 2)
            .strength(GRAPH_CONFIG.centerForceStrength));

    // State management
    let focusedNodeId = null;
    let hasClickedEmptySpace = false;

    // Create enhanced tooltip
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "graph-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "rgba(0, 15, 26, 0.95)")
        .style("color", "#f0f0f0")
        .style("padding", "10px 14px")
        .style("border-radius", "6px")
        .style("font-size", "12px")
        .style("font-family", "monospace")
        .style("pointer-events", "none")
        .style("box-shadow", "0 4px 6px rgba(0, 0, 0, 0.3)")
        .style("max-width", "300px")
        .style("z-index", "1000");

    // Define arrow marker
    svg.append("defs")
        .append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#9ca3af");

    // Create link groups
    const linkGroup = g.append("g")
        .attr("class", "links")
        .selectAll("g")
        .data(links)
        .join("g")
        .attr("class", d => DYNAMIC_LINK_TYPES.has(d.type) ? "dynamic-link" : "static-link");

    // Add link lines
    linkGroup.append("line")
        .attr("stroke", d => GRAPH_CONFIG.linkColors[d.type] || GRAPH_CONFIG.linkColors.default)
        .attr("stroke-width", GRAPH_CONFIG.strokeWidth.default)
        .attr("stroke-opacity", 0.8)
        .attr("marker-end", d => d.type !== "structural" ? "url(#arrow)" : null);

    // Add link labels
    linkGroup.append("text")
        .attr("class", "link-label")
        .attr("text-anchor", "middle")
        .attr("dy", -5)
        .attr("font-size", "10px")
        .attr("fill", "#d1d5db")
        .attr("font-family", "sans-serif")
        .text(d => getLinkLabel(d));

    // Create node groups
    const nodeGroup = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragStart)
            .on("drag", dragging)
            .on("end", dragEnd));

    // Add node circles
    nodeGroup.append("circle")
        .attr("r", GRAPH_CONFIG.nodeRadius)
        .attr("fill", d => GRAPH_CONFIG.colors[d.type] || GRAPH_CONFIG.colors.default)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1.5)
        .attr("cursor", "pointer");

    // Add node labels
    nodeGroup.append("text")
        .attr("class", "node-label")
        .attr("dx", GRAPH_CONFIG.labelDx)
        .attr("dy", GRAPH_CONFIG.labelDy)
        .attr("fill", "#e5e7eb")
        .attr("font-size", GRAPH_CONFIG.labelFontSize)
        .attr("font-family", "sans-serif")
        .attr("pointer-events", "none")
        .text(d => truncateLabel(d.name, 30));

    // Node interaction handlers
    nodeGroup
        .on("click", (event, d) => handleNodeClick(event, d))
        .on("mouseover", function (event, d) {
            showTooltip(event, d);
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("r", GRAPH_CONFIG.focusedNodeRadius)
                .attr("stroke-width", 2);
        })
        .on("mousemove", (event) => {
            tooltip
                .style("top", (event.pageY - 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("visibility", "hidden");
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("r", GRAPH_CONFIG.nodeRadius)
                .attr("stroke-width", 1.5);
        });

    // SVG background click handler
    svg.on("click", (event) => {
        if (event.target.tagName === "svg") {
            handleBackgroundClick();
        }
    });

    // Simulation tick handler
    simulation.on("tick", () => {
        linkGroup.select("line")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        linkGroup.select("text")
            .attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);

        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Helper functions
    function getLinkLabel(link) {
        if (link.label) return link.label;

        const labelMap = {
            input: "Input",
            output: "Output",
            "style-use": "Styles",
            "stylesheet-use": "Styles",
            "element-use": "Uses",
            "function-call": "Calls",
            "variable-use": "Uses",
            "js-style-mod": "Modifies"
        };

        return labelMap[link.type] || "";
    }

    function truncateLabel(text, maxLength) {
        if (!text) return "";
        return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
    }

    function showTooltip(event, node) {
        let content = `<strong>${node.name}</strong><br/>Type: ${node.type}`;

        if (node.content) {
            const preview = node.content.slice(0, 150);
            content += `<br/><br/>${preview}${node.content.length > 150 ? "..." : ""}`;
        }

        tooltip
            .style("visibility", "visible")
            .html(content);
    }

    function handleNodeClick(event, node) {
        event.stopPropagation();

        const detailsPanel = document.getElementById('details-panel');
        const detailsContent = document.getElementById('details-content');

        focusedNodeId = node.id;
        hasClickedEmptySpace = false;

        // Update details panel
        detailsPanel.style.display = "block";
        detailsContent.textContent = getNodeDetails(node);

        // Zoom to node
        if (node.type === "function" || node.type === "script") {
            zoomToNode(node);
        }

        updateVisibility();
    }

    function handleBackgroundClick() {
        const detailsPanel = document.getElementById('details-panel');
        const detailsContent = document.getElementById('details-content');

        // Reset zoom
        svg.transition()
            .duration(GRAPH_CONFIG.transitionDuration)
            .call(zoom.transform, d3.zoomIdentity);

        // Hide details panel
        detailsPanel.style.display = "none";
        detailsContent.textContent = "";

        focusedNodeId = null;
        hasClickedEmptySpace = true;

        updateVisibility();
    }

    function getNodeDetails(node) {
        if (node.type === "function") {
            return node.content || "No function code available";
        }

        if (node.type === "script") {
            return scriptContentMap.get(node.id) || "External script or no content available";
        }

        if (["element", "game-element", "stylesheet", "external-style", "inline-style"].includes(node.type)) {
            return node.content || `${node.name} (No additional details)`;
        }

        return `${node.name}\nType: ${node.type}`;
    }

    function zoomToNode(node) {
        const scale = 2;
        const x = -node.x * scale + width / 2;
        const y = -node.y * scale + height / 2;

        svg.transition()
            .duration(GRAPH_CONFIG.transitionDuration)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }

    function updateVisibility() {
        const connectedNodes = getConnectedNodes();
        const visibleLinks = getVisibleLinks(connectedNodes);

        // Update node visibility
        nodeGroup.each(function (d) {
            const group = d3.select(this);
            const isVisible = focusedNodeId === null || connectedNodes.has(d.id);
            const opacity = focusedNodeId === null ? 1 : (isVisible ? 1 : GRAPH_CONFIG.opacity.dimmed);

            group.transition()
                .duration(300)
                .style("opacity", opacity);
        });

        // Update link visibility
        linkGroup.each(function (d) {
            const group = d3.select(this);
            const visibility = visibleLinks.get(d);

            if (visibility === "hidden") {
                group.style("display", "none");
            } else {
                group.style("display", "block");

                const opacity = visibility === "dimmed"
                    ? GRAPH_CONFIG.opacity.dimmed
                    : GRAPH_CONFIG.opacity.default;

                const strokeWidth = visibility === "focused"
                    ? GRAPH_CONFIG.strokeWidth.focused
                    : GRAPH_CONFIG.strokeWidth.default;

                group.select("line")
                    .transition()
                    .duration(300)
                    .style("opacity", opacity)
                    .attr("stroke-width", strokeWidth);

                group.select("text")
                    .transition()
                    .duration(300)
                    .style("opacity", opacity);
            }
        });

        simulation.alpha(0.1).restart();
    }

    function getConnectedNodes() {
        const connected = new Set();

        if (focusedNodeId === null) return connected;

        connected.add(focusedNodeId);

        links.forEach(link => {
            if (link.source.id === focusedNodeId) {
                connected.add(link.target.id);
            } else if (link.target.id === focusedNodeId) {
                connected.add(link.source.id);
            }
        });

        return connected;
    }

    function getVisibleLinks(connectedNodes) {
        const linkVisibility = new Map();

        links.forEach(link => {
            const isDynamic = DYNAMIC_LINK_TYPES.has(link.type);

            if (focusedNodeId === null) {
                // No focus: hide dynamic links, show others dimmed
                if (isDynamic) {
                    linkVisibility.set(link, hasClickedEmptySpace ? "hidden" : "dimmed");
                } else {
                    linkVisibility.set(link, "default");
                }
            } else {
                // Has focus: show connected links
                const isConnected = link.source.id === focusedNodeId ||
                    link.target.id === focusedNodeId;

                if (isConnected) {
                    linkVisibility.set(link, "focused");
                } else if (isDynamic) {
                    linkVisibility.set(link, "hidden");
                } else {
                    linkVisibility.set(link, "hidden");
                }
            }
        });

        return linkVisibility;
    }

    // Drag handlers
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

    // Initial visibility update
    updateVisibility();
}