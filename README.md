# HTMLVisualizer

**HTMLVisualizer** is a web-based tool that generates an interactive graph representation of an HTML document’s structure. It visualizes elements, styles, scripts, and relationships between them, helping users understand and analyze the HTML hierarchy.

## Features

- Upload an HTML file to generate its structure map.
- Interactive visualization using D3.js.
- Identifies and links:
  - Inline styles to respective elements.
  - JavaScript-modified styles and their effects.
  - Stylesheet rules and the elements they apply to.
  - Script functions, variables, and function calls.
- Displays detailed information about selected nodes.
- Supports zooming, panning, and dragging nodes.
- Clicking on a node opens up the code in a side view and hides all other connections except for the ones attached to the selected node.
- Contains offline access and PWA support!

## Installation

No installation required. Open HTMLVisualizer.html in a browser, or use the GitHub Pages.

## Usage

1. Open `index.html` in a web browser.
2. Click the **Upload** button and select an HTML file.
3. View the generated interactive structure map.
4. Click on nodes to see additional details.
5. Use zoom and drag interactions to explore the graph.

## Dependencies

- [D3.js v7](https://d3js.org/)
- Standard HTML5, JavaScript, and CSS.

## How It Works

1. **DOM Parsing**: The tool reads and analyzes the uploaded HTML file.
2. **Graph Construction**: Elements, styles, and scripts are extracted and linked.
3. **Interactive Visualization**: The relationships between elements, styles, and scripts are displayed as a graph.

## Contributing

Feel free to contribute by submitting issues or pull requests.

## License

This project is open-source and available under the MIT License.
