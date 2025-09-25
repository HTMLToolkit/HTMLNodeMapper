// htmlParser.js - Module for parsing HTML and extracting nodes and links

import { findFunctionEnd, updateProgress } from './utils.js';

export function parseHTML(html, progressBar, loading, progressContainer, resetUI, renderGraph) {
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
                    elementMap.set(`.${cls}`, currentId);
                    addNode(`.${cls}`, "class", currentId);
                });
            }
            if (element.hasAttribute("style")) {
                const styleContent = element.getAttribute("style");
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

                let returnMatch;
                while ((returnMatch = returnRegex.exec(funcCode)) !== null) {
                    const returnValue = returnMatch[1].trim();
                    const returnId = addNode(`Return: ${returnValue}`, "output", funcId);
                    links.push({ source: funcId, target: returnId, type: "output", label: `Returns: ${returnValue}` });
                }

                let varMatch;
                while ((varMatch = varAssignRegex.exec(funcCode)) !== null) {
                    const varName = varMatch[1];
                    const varValue = varMatch[2].trim();
                    const varId = addNode(`Variable Change: ${varName}`, "variable", funcId, `New Value: ${varValue}`);
                    links.push({ source: funcId, target: varId, type: "output", label: `Sets: ${varName} = ${varValue}` });
                }

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

        updateProgress(progressBar, 25);
        traverseDOM(doc.body);
        updateProgress(progressBar, 50);
        extractScriptsAndStyles(doc);
        updateProgress(progressBar, 75);
        extractGameElements(doc);
        linkStylesToElements(nodes);
        updateProgress(progressBar, 100);

        setTimeout(() => {
            loading.innerText = "Map generated successfully!";
            resetUI(loading, progressContainer);
            renderGraph(nodes, links, scriptContentMap);
        }, 500);
    } catch (error) {
        loading.innerText = `Error: ${error.message}`;
        resetUI(loading, progressContainer);
    }
}