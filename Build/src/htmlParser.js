// htmlParser.js - Node.js version using parse5, acorn, and css

import { parse as parse5HTML } from "parse5";
import { parse as parseJS } from "acorn";
import { parse as parseCSS } from "css";
import { findFunctionEnd, updateProgress } from "./utils.js";

/**
 * Parse HTML, extract nodes, links, scripts, and styles.
 * @param {string} html
 * @param {HTMLElement} progressBar
 * @param {HTMLElement} loading
 * @param {HTMLElement} progressContainer
 * @param {function} resetUI
 * @param {function} renderGraph
 */
export function parseHTML(html, progressBar, loading, progressContainer, resetUI, renderGraph) {
    try {
        // Parse HTML into a tree
        const document = parse5HTML(html, { sourceCodeLocationInfo: true });
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

        // Traverse parse5 AST
        function traverseDOM(node, parentId = null) {
            if (!node) return;
            if (node.nodeName === "#text" || node.nodeName === "#comment") return;

            const nodeName = node.tagName || node.nodeName;
            const currentId = addNode(nodeName, "element", parentId,
                node.__location ? html.substring(node.__location.startOffset, node.__location.endOffset) : null
            );

            // Register element tag for tag selectors
            elementMap.set(nodeName, currentId);

            // Attributes: only map IDs and classes, do NOT create extra nodes
            if (node.attrs) {
                node.attrs.forEach(attr => {
                    if (attr.name === "id") {
                        elementMap.set(`#${attr.value}`, currentId);
                    }
                    if (attr.name === "class") {
                        attr.value.split(/\s+/).forEach(cls => elementMap.set(`.${cls}`, currentId));
                    }
                    if (attr.name === "style") {
                        addNode("Inline Style", "inline-style", currentId, attr.value);
                    }
                });
            }

            if (node.childNodes) {
                node.childNodes.forEach(child => traverseDOM(child, currentId));
            }
        }

        // Parse JS using Acorn
        function parseScriptContent(scriptContent, scriptId) {
            scriptContentMap.set(scriptId, scriptContent);

            const ast = parseJS(scriptContent, { ecmaVersion: "latest" });

            function walkNode(node, parentId) {
                switch (node.type) {
                    case "FunctionDeclaration": {
                        const funcId = addNode(`Function: ${node.id.name}`, "function", parentId, scriptContent.substring(node.start, node.end));
                        node.params.forEach(param => {
                            const paramId = addNode(`Input: ${param.name}`, "input", funcId);
                            links.push({ source: paramId, target: funcId, type: "input" });
                        });
                        if (node.body.body) {
                            node.body.body.forEach(childNode => walkNode(childNode, funcId));
                        }
                        break;
                    }
                    case "ReturnStatement": {
                        if (node.argument) {
                            const returnVal = node.argument.start != null
                                ? scriptContent.substring(node.argument.start, node.argument.end)
                                : "<empty>";
                            const returnId = addNode(`Return: ${returnVal}`, "output", parentId);
                            links.push({ source: parentId, target: returnId, type: "output" });
                        }
                        break;
                    }

                    case "VariableDeclaration": {
                        node.declarations.forEach(decl => {
                            const value = decl.init && decl.init.start != null
                                ? scriptContent.substring(decl.init.start, decl.init.end)
                                : "<uninitialized>";
                            const varId = addNode(`Variable Change: ${decl.id.name}`, "variable", parentId, `New Value: ${value}`);
                            links.push({ source: parentId, target: varId, type: "output" });
                        });
                        break;
                    }

                    case "ExpressionStatement": {
                        if (node.expression.type === "AssignmentExpression") {
                            const left = node.expression.left && node.expression.left.start != null
                                ? scriptContent.substring(node.expression.left.start, node.expression.left.end)
                                : "<unknown>";
                            const right = node.expression.right && node.expression.right.start != null
                                ? scriptContent.substring(node.expression.right.start, node.expression.right.end)
                                : "<unknown>";
                            const domId = addNode(`DOM Change: ${left}`, "dom-change", parentId, `New Value: ${right}`);
                            links.push({ source: parentId, target: domId, type: "output" });
                        }
                        break;
                    }
                }

                for (let key in node) {
                    if (node[key] && typeof node[key] === "object" && key !== "parent") {
                        if (Array.isArray(node[key])) node[key].forEach(n => n && walkNode(n, parentId));
                        else walkNode(node[key], parentId);
                    }
                }
            }

            walkNode(ast, scriptId);
        }

        // Extract scripts and styles from parse5 AST
        function extractScriptsAndStyles(node, parentId = null) {
            if (!node) return;

            if (node.tagName === "script") {
                const srcAttr = node.attrs?.find(a => a.name === "src");
                const src = srcAttr ? srcAttr.value : "inline-script";
                const scriptId = addNode(src, "script", parentId);

                if (!srcAttr && node.childNodes && node.childNodes[0]?.value) {
                    parseScriptContent(node.childNodes[0].value, scriptId);
                }
            }

            if (node.tagName === "link" && node.attrs?.some(a => a.name === "rel" && a.value === "stylesheet")) {
                const href = node.attrs.find(a => a.name === "href")?.value || "external-style";
                const styleId = addNode(href, "external-style", parentId);
                styleMap.set(href, { id: styleId, css: null });
            }

            if (node.tagName === "style") {
                const cssContent = node.childNodes?.[0]?.value || "";
                const styleId = addNode("inline-stylesheet", "stylesheet", parentId, cssContent);

                try {
                    const parsedCSS = parseCSS(cssContent);
                    styleMap.set("inline-stylesheet", { id: styleId, css: parsedCSS });
                } catch (e) {
                    console.warn("Failed to parse CSS:", e.message);
                }
            }


            if (node.childNodes) node.childNodes.forEach(child => extractScriptsAndStyles(child, parentId));
        }

        function linkStylesToElements() {
            for (const [styleName, styleInfo] of styleMap.entries()) {
                if (!styleInfo || !styleInfo.css || !styleInfo.css.stylesheet) continue;

                const styleId = styleInfo.id;
                const rules = styleInfo.css.stylesheet.rules || [];

                for (const rule of rules) {
                    if (rule.type !== "rule" || !rule.selectors) continue;

                    for (let selector of rule.selectors) {
                        selector = selector.trim().replace(/:.+$/, ""); // remove pseudo-classes
                        const parts = selector.split(/\s+/).map(p => p.trim());

                        // helper to match a single part
                        function matchPart(part) {
                            const ids = new Set();
                            const tagMatch = part.match(/^([a-zA-Z][\w-]*)/);
                            const classMatches = [...part.matchAll(/\.([\w-]+)/g)];
                            const idMatch = part.match(/#([\w-]+)/);

                            if (tagMatch && elementMap.has(tagMatch[1])) ids.add(elementMap.get(tagMatch[1]));
                            if (idMatch && elementMap.has(`#${idMatch[1]}`)) ids.add(elementMap.get(`#${idMatch[1]}`));
                            for (const cls of classMatches) {
                                if (elementMap.has(`.${cls[1]}`)) ids.add(elementMap.get(`.${cls[1]}`));
                            }
                            return ids;
                        }

                        const candidateIds = matchPart(parts[parts.length - 1]);
                        const matchedIds = new Set();

                        // verify full ancestor chain
                        function matchesSelectorPath(nodeId) {
                            let currentId = nodeId;
                            for (let i = parts.length - 2; i >= 0; i--) {
                                const parentLink = links.find(l => l.target === currentId && l.type === "structural");
                                if (!parentLink) return false;
                                const parentId = parentLink.source;
                                const ids = matchPart(parts[i]);
                                if (!ids.has(parentId)) return false;
                                currentId = parentId;
                            }
                            return true;
                        }

                        candidateIds.forEach(id => {
                            if (matchesSelectorPath(id)) matchedIds.add(id);
                        });

                        // add links for matched elements
                        matchedIds.forEach(targetId => {
                            links.push({
                                source: styleId,
                                target: targetId,
                                type: "stylesheet-use",
                                label: `Applies ${selector}`,
                                visible: true
                            });
                        });
                    }
                }
            }
        }

        updateProgress(progressBar, 25);
        traverseDOM(document);
        updateProgress(progressBar, 50);
        extractScriptsAndStyles(document);
        updateProgress(progressBar, 75);
        linkStylesToElements();
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
