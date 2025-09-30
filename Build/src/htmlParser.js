// htmlParser.js - Node.js version using parse5, acorn, and css

import { parse as parse5HTML } from "parse5";
import { parse as parseJS } from "acorn";
import { parse as parseCSS } from "css";
import { updateProgress } from "./utils.js";

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
        const document = parse5HTML(html, { sourceCodeLocationInfo: true });

        // Centralized state management
        const state = {
            nodes: [],
            links: [],
            nodeId: 0,
            nodeMap: new Map(),
            styleMap: new Map(),
            scriptContentMap: new Map(),
            elementMap: new Map()
        };

        // Node creation factory
        const createNode = (name, type, parentId = null, content = null) => {
            const id = state.nodeId++;
            const node = { id, name, type, content };

            state.nodes.push(node);
            state.nodeMap.set(id, { name, type, content });

            if (parentId !== null) {
                state.links.push({ source: parentId, target: id, type: "structural" });
            }

            return id;
        };

        // Link creation helper
        const createLink = (source, target, type, label = null, visible = true) => {
            const link = { source, target, type, visible };
            if (label) link.label = label;
            state.links.push(link);
        };

        // DOM Traversal
        const traverseDOM = (node, parentId = null) => {
            if (!node || node.nodeName === "#text" || node.nodeName === "#comment") {
                return;
            }

            const nodeName = node.tagName || node.nodeName;
            const content = node.__location
                ? html.substring(node.__location.startOffset, node.__location.endOffset)
                : null;

            const currentId = createNode(nodeName, "element", parentId, content);

            // Register element for CSS selector matching
            state.elementMap.set(nodeName, currentId);

            // Process attributes efficiently
            if (node.attrs) {
                for (const attr of node.attrs) {
                    switch (attr.name) {
                        case "id":
                            state.elementMap.set(`#${attr.value}`, currentId);
                            break;
                        case "class":
                            attr.value.split(/\s+/).forEach(cls => {
                                if (cls) state.elementMap.set(`.${cls}`, currentId);
                            });
                            break;
                        case "style":
                            createNode("Inline Style", "inline-style", currentId, attr.value);
                            break;
                    }
                }
            }

            // Traverse children
            if (node.childNodes) {
                node.childNodes.forEach(child => traverseDOM(child, currentId));
            }
        };

        // JavaScript AST Walker
        const walkJSNode = (node, parentId, scriptContent) => {
            if (!node) return;

            const getSourceText = (start, end) => {
                return start != null && end != null
                    ? scriptContent.substring(start, end)
                    : "<unknown>";
            };

            switch (node.type) {
                case "FunctionDeclaration": {
                    const funcName = node.id?.name || "anonymous";
                    const funcId = createNode(
                        `Function: ${funcName}`,
                        "function",
                        parentId,
                        getSourceText(node.start, node.end)
                    );

                    // Handle parameters
                    node.params.forEach(param => {
                        const paramName = param.name || getSourceText(param.start, param.end);
                        const paramId = createNode(`Input: ${paramName}`, "input", funcId);
                        createLink(paramId, funcId, "input");
                    });

                    // Walk function body
                    if (node.body?.body) {
                        node.body.body.forEach(childNode =>
                            walkJSNode(childNode, funcId, scriptContent)
                        );
                    }
                    break;
                }

                case "ReturnStatement": {
                    if (node.argument) {
                        const returnVal = getSourceText(node.argument.start, node.argument.end);
                        const returnId = createNode(`Return: ${returnVal}`, "output", parentId);
                        createLink(parentId, returnId, "output");
                    }
                    break;
                }

                case "VariableDeclaration": {
                    node.declarations.forEach(decl => {
                        const varName = decl.id?.name || getSourceText(decl.id.start, decl.id.end);
                        const value = decl.init
                            ? getSourceText(decl.init.start, decl.init.end)
                            : "<uninitialized>";

                        const varId = createNode(
                            `Variable Change: ${varName}`,
                            "variable",
                            parentId,
                            `New Value: ${value}`
                        );
                        createLink(parentId, varId, "output");
                    });
                    break;
                }

                case "ExpressionStatement": {
                    if (node.expression?.type === "AssignmentExpression") {
                        const left = getSourceText(
                            node.expression.left.start,
                            node.expression.left.end
                        );
                        const right = getSourceText(
                            node.expression.right.start,
                            node.expression.right.end
                        );

                        const domId = createNode(
                            `DOM Change: ${left}`,
                            "dom-change",
                            parentId,
                            `New Value: ${right}`
                        );
                        createLink(parentId, domId, "output");
                    }
                    break;
                }
            }

            // Recursively walk child nodes
            for (const key in node) {
                const value = node[key];
                if (value && typeof value === "object" && key !== "parent") {
                    if (Array.isArray(value)) {
                        value.forEach(item => item && walkJSNode(item, parentId, scriptContent));
                    } else {
                        walkJSNode(value, parentId, scriptContent);
                    }
                }
            }
        };

        // Script parsing
        const parseScriptContent = (scriptContent, scriptId) => {
            state.scriptContentMap.set(scriptId, scriptContent);

            try {
                const ast = parseJS(scriptContent, { ecmaVersion: "latest", sourceType: "module" });
                walkJSNode(ast, scriptId, scriptContent);
            } catch (e) {
                console.warn(`Failed to parse script: ${e.message}`);
            }
        };

        // Extract scripts and styles
        const extractScriptsAndStyles = (node, parentId = null) => {
            if (!node) return;

            if (node.tagName === "script") {
                const srcAttr = node.attrs?.find(a => a.name === "src");
                const src = srcAttr?.value || "inline-script";
                const scriptId = createNode(src, "script", parentId);

                if (!srcAttr && node.childNodes?.[0]?.value) {
                    parseScriptContent(node.childNodes[0].value, scriptId);
                }
            }

            if (node.tagName === "link") {
                const isStylesheet = node.attrs?.some(a =>
                    a.name === "rel" && a.value === "stylesheet"
                );

                if (isStylesheet) {
                    const href = node.attrs.find(a => a.name === "href")?.value || "external-style";
                    const styleId = createNode(href, "external-style", parentId);
                    state.styleMap.set(href, { id: styleId, css: null });
                }
            }

            if (node.tagName === "style") {
                const cssContent = node.childNodes?.[0]?.value || "";
                const styleId = createNode("inline-stylesheet", "stylesheet", parentId, cssContent);

                try {
                    const parsedCSS = parseCSS(cssContent);
                    state.styleMap.set("inline-stylesheet", { id: styleId, css: parsedCSS });
                } catch (e) {
                    console.warn(`Failed to parse CSS: ${e.message}`);
                }
            }

            if (node.childNodes) {
                node.childNodes.forEach(child => extractScriptsAndStyles(child, parentId));
            }
        };

        // CSS Selector matching helpers
        const matchSelectorPart = (part) => {
            const ids = new Set();

            // Match tag name
            const tagMatch = part.match(/^([a-zA-Z][\w-]*)/);
            if (tagMatch && state.elementMap.has(tagMatch[1])) {
                ids.add(state.elementMap.get(tagMatch[1]));
            }

            // Match ID selector
            const idMatch = part.match(/#([\w-]+)/);
            if (idMatch && state.elementMap.has(`#${idMatch[1]}`)) {
                ids.add(state.elementMap.get(`#${idMatch[1]}`));
            }

            // Match class selectors
            const classMatches = [...part.matchAll(/\.([\w-]+)/g)];
            for (const cls of classMatches) {
                const className = `.${cls[1]}`;
                if (state.elementMap.has(className)) {
                    ids.add(state.elementMap.get(className));
                }
            }

            return ids;
        };

        const matchesSelectorPath = (nodeId, parts) => {
            let currentId = nodeId;

            for (let i = parts.length - 2; i >= 0; i--) {
                const parentLink = state.links.find(
                    l => l.target === currentId && l.type === "structural"
                );

                if (!parentLink) return false;

                const parentId = parentLink.source;
                const matchedIds = matchSelectorPart(parts[i]);

                if (!matchedIds.has(parentId)) return false;

                currentId = parentId;
            }

            return true;
        };

        // Link CSS styles to elements
        const linkStylesToElements = () => {
            for (const [styleName, styleInfo] of state.styleMap.entries()) {
                if (!styleInfo?.css?.stylesheet) continue;

                const { id: styleId, css } = styleInfo;
                const rules = css.stylesheet.rules || [];

                for (const rule of rules) {
                    if (rule.type !== "rule" || !rule.selectors) continue;

                    for (let selector of rule.selectors) {
                        // Normalize selector
                        selector = selector.trim().replace(/:.+$/, "");
                        const parts = selector.split(/\s+/).map(p => p.trim()).filter(Boolean);

                        if (parts.length === 0) continue;

                        // Find matching elements
                        const candidateIds = matchSelectorPart(parts[parts.length - 1]);

                        candidateIds.forEach(nodeId => {
                            if (matchesSelectorPath(nodeId, parts)) {
                                createLink(
                                    styleId,
                                    nodeId,
                                    "stylesheet-use",
                                    `Applies ${selector}`
                                );
                            }
                        });
                    }
                }
            }
        };

        // Execute parsing pipeline
        updateProgress(progressBar, 25);
        traverseDOM(document);

        updateProgress(progressBar, 50);
        extractScriptsAndStyles(document);

        updateProgress(progressBar, 75);
        linkStylesToElements();

        updateProgress(progressBar, 100);

        // Finalize
        setTimeout(() => {
            loading.innerText = "Map generated successfully!";
            resetUI(loading, progressContainer);
            renderGraph(state.nodes, state.links, state.scriptContentMap);
        }, 500);

    } catch (error) {
        console.error("Parsing error:", error);
        loading.innerText = `Error: ${error.message}`;
        resetUI(loading, progressContainer);
    }
}