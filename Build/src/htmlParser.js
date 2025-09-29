// htmlParser.js - Node.js version using parse5, acorn, and css

import { parse as parse5HTML } from "parse5";
import { parse as parseJS } from "acorn";
import { parse } from "css";
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
        const document = parse5HTML(html);
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

            let nodeName = node.tagName || node.nodeName;
            let currentId = addNode(nodeName, "element", parentId, node.__location ? html.substring(node.__location.startOffset, node.__location.endOffset) : null);

            // Attributes
            if (node.attrs) {
                node.attrs.forEach(attr => {
                    if (attr.name === "id") {
                        elementMap.set(`#${attr.value}`, currentId);
                        addNode(`#${attr.value}`, "id", currentId);
                    }
                    if (attr.name === "class") {
                        attr.value.split(/\s+/).forEach(cls => {
                            elementMap.set(`.${cls}`, currentId);
                            addNode(`.${cls}`, "class", currentId);
                        });
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
                styleMap.set(href, styleId);
            }

            if (node.tagName === "style") {
                const styleId = addNode("inline-stylesheet", "stylesheet", parentId, node.childNodes?.[0]?.value);
                styleMap.set("inline-stylesheet", styleId);
            }

            if (node.childNodes) node.childNodes.forEach(child => extractScriptsAndStyles(child, parentId));
        }

        function extractGameElements(node, parentId = null) {
            if (!node) return;

            const selectors = ["#player", ".platform", ".spike", ".teleporter", "#ground", "#gameOver"];
            if (node.attrs) {
                node.attrs.forEach(attr => {
                    const val = attr.value;
                    if ((attr.name === "id" && selectors.includes(`#${val}`)) ||
                        (attr.name === "class" && val.split(/\s+/).some(c => selectors.includes(`.${c}`)))) {
                        addNode(attr.value, "game-element", parentId, node.__location ? html.substring(node.__location.startOffset, node.__location.endOffset) : null);
                    }
                });
            }

            if (node.childNodes) node.childNodes.forEach(child => extractGameElements(child, parentId));
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
        traverseDOM(document);
        updateProgress(progressBar, 50);
        extractScriptsAndStyles(document);
        updateProgress(progressBar, 75);
        extractGameElements(document);
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
