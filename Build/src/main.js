import * as d3 from 'd3';

const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const detailsPanel = document.getElementById('details-panel');
const detailsContent = document.getElementById('details-content');

fileInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;

    loading.style.display = "block";
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";

    const reader = new FileReader();
    reader.onload = (e) => parseHTML(e.target.result);
    reader.onerror = () => {
        loading.innerText = "Error reading file!";
        resetUI();
    };
    reader.readAsText(file);
});

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
}

function resetUI() {
    setTimeout(() => {
        loading.style.display = "none";
        progressContainer.style.display = "none";
    }, 1500);
}

function findFunctionEnd(scriptContent, startIndex) {
    let braceCount = 0;
    let i = startIndex;
    while (i < scriptContent.length) {
        if (scriptContent[i] === '{') braceCount++;
        else if (scriptContent[i] === '}') braceCount--;
        if (braceCount === 0) return i + 1;
        i++;
    }
    return scriptContent.length;
}

function parseHTML(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        if (!doc.body) throw new Error("Invalid HTML structure");

        const nodes = [];
        const links = [];
        let nodeId = 0;
        const nodeMap = new Map();
        const styleMap = new Map();
        const scriptContentMap = new Map();
        const elementMap = new Map();
        const variableMap = new Map();

        function addNode(name, type, parentId = null, content = null) {
            const id = nodeId++;
            nodes.push({ id, name, type, content });
            nodeMap.set(id, { name, type, content });
            if (parentId !== null) {
                links.push({ source: parentId, target: id, type: "structural" });
            }
            return id;
        }

        function traverseDOM(element, parentId = null) {
            if (!element || !element.tagName) return;

            const nodeName = element.id ? `#${element.id}` : element.tagName.toLowerCase();
            const currentId = addNode(nodeName, "element", parentId, element.outerHTML);
            if (element.id) {
                elementMap.set(`#${element.id}`, currentId);
                addNode(`#${element.id}`, "id", currentId);
            }
            if (element.classList.length) {
                element.classList.forEach(cls => {
                    // Create or record a class node
                    elementMap.set(`.${cls}`, currentId);
                    addNode(`.${cls}`, "class", currentId);
                });
            }
            // NEW: Link inline styles to their element
            if (element.hasAttribute("style")) {
                const styleContent = element.getAttribute("style");
                // Create an inline style node as a child of the element
                addNode("Inline Style", "inline-style", currentId, styleContent);
            }
            [...element.children].forEach(child => traverseDOM(child, currentId));
        }

        function parseScriptContent(scriptContent, scriptId) {
            const funcRegex = /function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/g;
            const returnRegex = /return\s+([^;]+)/g;
            const varAssignRegex = /([a-zA-Z_]\w*)\s*=\s*([^;]+)/g;
            const domModRegex = /document\.getElementById\s*\(['"]([^'"]+)['"]\)\.(innerHTML|textContent|style\.[a-zA-Z_]\w*)\s*=\s*([^;]+)/g;

            let match;
            const functions = new Map();

            scriptContentMap.set(scriptId, scriptContent);

            // Detect function declarations
            while ((match = funcRegex.exec(scriptContent)) !== null) {
                const funcName = match[1];
                const params = match[2].split(',').map(p => p.trim()).filter(p => p);
                const funcIndex = match.index;
                const funcEnd = findFunctionEnd(scriptContent, scriptContent.indexOf('{', funcIndex));
                const funcCode = scriptContent.substring(funcIndex, funcEnd);
                const funcId = addNode(`Function: ${funcName}`, "function", scriptId, funcCode);
                functions.set(funcName, { id: funcId, code: funcCode });

                params.forEach(param => {
                    const paramId = addNode(`Input: ${param}`, "input", funcId);
                    links.push({ source: paramId, target: funcId, type: "input" });
                });

                // Detect return statements inside this function
                let returnMatch;
                while ((returnMatch = returnRegex.exec(funcCode)) !== null) {
                    const returnValue = returnMatch[1].trim();
                    const returnId = addNode(`Return: ${returnValue}`, "output", funcId);
                    links.push({ source: funcId, target: returnId, type: "output", label: `Returns: ${returnValue}` });
                }

                // Detect variable modifications inside this function
                let varMatch;
                while ((varMatch = varAssignRegex.exec(funcCode)) !== null) {
                    const varName = varMatch[1];
                    const varValue = varMatch[2].trim();
                    const varId = addNode(`Variable Change: ${varName}`, "variable", funcId, `New Value: ${varValue}`);
                    links.push({ source: funcId, target: varId, type: "output", label: `Sets: ${varName} = ${varValue}` });
                }

                // Detect DOM modifications inside this function
                let domMatch;
                while ((domMatch = domModRegex.exec(funcCode)) !== null) {
                    const elementId = domMatch[1];
                    const property = domMatch[2];
                    const newValue = domMatch[3].trim();
                    const domId = addNode(`DOM Change: ${elementId}.${property}`, "dom-change", funcId, `New Value: ${newValue}`);
                    links.push({ source: funcId, target: domId, type: "output", label: `Modifies: ${elementId}.${property}` });
                }
            }
        }


        function extractScriptsAndStyles(doc) {
            doc.querySelectorAll("script").forEach(script => {
                const src = script.src || "inline-script";
                const scriptId = addNode(src, "script");
                const parent = script.parentNode;
                if (parent && parent.tagName) {
                    const parentId = nodes.find(n => n.name === parent.tagName.toLowerCase() || n.name === `#${parent.id}`)?.id;
                    if (parentId !== undefined) {
                        links.push({ source: parentId, target: scriptId, type: "structural" });
                    }
                }
                if (!script.src && script.textContent) {
                    parseScriptContent(script.textContent, scriptId);
                }
            });

            doc.querySelectorAll("link[rel='stylesheet'], style").forEach(style => {
                const isExternal = style.href;
                const href = isExternal ? style.href : "inline-stylesheet";
                const styleType = isExternal ? "external-style" : "stylesheet";
                const styleId = addNode(href, styleType, null, style.outerHTML);
                styleMap.set(href, styleId);
                const parent = style.parentNode;
                if (parent && parent.tagName) {
                    const parentId = nodes.find(n => n.name === parent.tagName.toLowerCase() || n.name === `#${parent.id}`)?.id;
                    if (parentId !== undefined) {
                        links.push({ source: parentId, target: styleId, type: "structural" });
                    }
                }
            });
        }

        function extractGameElements(doc) {
            const selectors = ["#player", ".platform", ".spike", ".teleporter", "#ground", "#gameOver"];
            selectors.forEach(selector => {
                doc.querySelectorAll(selector).forEach(element => {
                    const gameId = addNode(selector, "game-element", null, element.outerHTML);
                    const parent = element.parentNode;
                    if (parent && parent.tagName) {
                        const parentId = nodes.find(n => n.name === parent.tagName.toLowerCase() || n.name === `#${parent.id}`)?.id;
                        if (parentId !== undefined) {
                            links.push({ source: parentId, target: gameId, type: "structural" });
                        }
                    }
                });
            });
        }

        // NEW: Link stylesheet nodes to elements that use their classes
        function linkStylesToElements(nodes) {
            nodes.forEach(node => {
                if (node.type === "element" && node.content) {
                    const classMatch = node.content.match(/class\s*=\s*['"]([^'"]+)['"]/);
                    if (classMatch) {
                        const classes = classMatch[1].split(/\s+/);
                        classes.forEach(cls => {
                            nodes.forEach(styleNode => {
                                if ((styleNode.type === "stylesheet" || styleNode.type === "external-style") && styleNode.content) {
                                    if (styleNode.content.includes(`.${cls}`)) {
                                        links.push({ source: styleNode.id, target: node.id, type: "stylesheet-use", label: `Applies .${cls}`, visible: true });
                                    }
                                }
                            });
                        });
                    }
                }
            });
        }

        updateProgress(25);
        traverseDOM(doc.body);
        updateProgress(50);
        extractScriptsAndStyles(doc);
        updateProgress(75);
        extractGameElements(doc);
        // NEW: Link stylesheet rules to elements by class usage
        linkStylesToElements(nodes);
        updateProgress(100);

        setTimeout(() => {
            loading.innerText = "Map generated successfully!";
            resetUI();
            renderGraph(nodes, links, scriptContentMap);
        }, 500);
    } catch (error) {
        loading.innerText = `Error: ${error.message}`;
        resetUI();
    }
}

function renderGraph(nodes, links, scriptContentMap) {
    const svg = d3.select("svg");
    svg.selectAll("*").remove();
    const width = document.getElementById('graph-container').clientWidth;
    const height = document.getElementById('graph-container').clientHeight;

    const g = svg.append("g");
    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(200))
        .force("charge", d3.forceManyBody().strength(-500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(40))
        .force("x", d3.forceX(width / 2).strength(0.1))
        .force("y", d3.forceY(height / 2).strength(0.1));

    let focusedNodeId = null;
    let hasClickedEmptySpace = false;

    const link = g.append("g")
        .selectAll("g")
        .data(links)
        .join("g")
        .attr("class", d => d.type === "element-use" || d.type === "style-use" || d.type === "variable-use" || d.type === "js-style-mod" ? "dynamic-link" : "static-link");

    link.append("line")
        .attr("stroke", d => d.type === "input" ? "yellow" : d.type === "output" ? "orange" : d.type === "style-use" ? "green" : d.type === "element-use" ? "cyan" : d.type === "function-call" ? "purple" : d.type === "variable-use" || d.type === "js-style-mod" ? "magenta" : "white")
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
        .attr("r", 10)
        .attr("fill", d => {
            switch (d.type) {
                case "element": return "blue";
                case "script": return "red";
                case "stylesheet":
                case "external-style": return "green";
                case "inline-style": return "orange";
                case "game-element": return "purple";
                case "function": return "pink";
                case "input": return "yellow";
                case "variable": return "magenta";
                default: return "gray";
            }
        })
        .on("click", (event, d) => {
            event.stopPropagation();
            detailsPanel.style.display = "block";
            focusedNodeId = d.id;
            hasClickedEmptySpace = false;
            if (d.type === "function") {
                detailsContent.textContent = d.content || "No function code available";
                const scale = 2;
                const x = -d.x * scale + width / 2;
                const y = -d.y * scale + height / 2;
                svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
            } else if (d.type === "script") {
                detailsContent.textContent = scriptContentMap.get(d.id) || "External script or no content";
            } else if (d.type === "element" || d.type === "game-element" || d.type === "stylesheet" || d.type === "external-style" || d.type === "inline-style") {
                detailsContent.textContent = d.content || `${d.name} (No additional details)`;
            } else {
                detailsContent.textContent = `${d.name} (Type: ${d.type})`;
            }
            updateVisibility();
        })
        .call(d3.drag()
            .on("start", dragStart)
            .on("drag", dragging)
            .on("end", dragEnd));

    svg.on("click", (event) => {
        if (event.target.tagName === "svg") {
            svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
            detailsPanel.style.display = "none";
            detailsContent.textContent = "";
            focusedNodeId = null;
            hasClickedEmptySpace = true;
            updateVisibility();
        }
    });

    const labels = g.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("dx", 12)
        .attr("dy", 4)
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
