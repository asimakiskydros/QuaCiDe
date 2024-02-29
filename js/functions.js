import * as Constants from './constants.js';
import { Gate } from './gate.js';

/**
     * Find the qubit currently hovered (if any) and indexize the left-coordinate of the mouse
     * with respect to that qubit.
     * @param {*} event The mouse event that triggered this behavior.
     * @param {*} hoveredGate The gate currently dragged by the cursor.
     * @param {*} circuit The current circuit description.
     * @returns A tuple of the cursor's relative position on the hovered qubit and the qubit in question.
     *          If none was found, returns [undefined, undefined].
     */
export function localize (event, hoveredGate, circuit) {
    // fetch the hovered qubit
    const hoveredQubit = circuit.findHoveredQubit(event);
    // if found, calculate the cursor's offset from its wire's start
    const offset = hoveredQubit ? event.clientX - hoveredQubit.wire.getBoundingClientRect().left : 0;
    
    if (!hoveredQubit || offset <= 0) return [undefined, undefined];

    /**
     * indexize in the range of [-0.5, inf, step:0.5]
     * say GATE_DELIMITER is 50. This is what the following maps to:
     * offset: 0...............25..............49...50.................75..............99..100... ....
     * index:  0...............0................0....1..................1...............1...2.... ....
     *         ^------v--------^^---------v---------^^---------v--------^^---------v-------^^---- ....
     * relPos:       -0.5                 0                   0.5                  1              .... 
     */
    const index = Math.floor(offset / Constants.GATE_DELIMITER);
    const mean = 0.5 * (index * Constants.GATE_DELIMITER + (index + 1) * Constants.GATE_DELIMITER);
    // if the cursor falls below the mean that defines the range of the integer position, OR
    // the gate is hovering above an identity or itself, fall back to the previous half.
    const relativePosition = offset < mean                                     || 
                            (index < hoveredQubit.weight                       &&
                             hoveredQubit.gates[index].type !== 'identityGate' &&
                             hoveredQubit.gates[index] !== hoveredGate)         ? index - 0.5 : index;

    return [relativePosition, hoveredQubit];
}

/**
 * Generates all possible 'n_bits'-bit binary integers as strings
 * and returns them in a list in order.
 * @param {*} n_bits The number of bits.
 * @returns A list of all possible binary integers as strings in order.
 */
export function generateBinaryStrings (n_bits) {
    const bins = [];
    for (let num = 0; num < 2 ** n_bits; num++)
        bins.push(num.toString(2).padStart(n_bits, '0'));
    return bins;
}

/**
 * Molds the given data into a matrix able to be drawn into a
 * heatmap. The rows are the half Most Significant Bits of the states
 * and the columns the half Least Significant ones. The heated value
 * is the probabilites. Hovertext for each cell projects state, amps and prob.
 * @param {*} amps The array of amplitudes in order.
 * @param {*} probs The array of probabilities in order.
 * @returns y-axis labels, x-axis labels, values and hovertext containers in that order.
 */
export function data2heatmap (amps, probs) {
    // create the array of binary state labels and fuse all arrays
    // into a lookup table by index.
    const heatmapData = generateBinaryStrings(Math.log2(amps.length))
    .map((state, index) => {
        const n_msb = Math.ceil(state.length / 2);
        return [
            state.substring(0, n_msb),
            state.substring(n_msb),
            amps[index],
            probs[index]
        ];
    });

    // create x-y axis labels
    const rows = [...new Set(heatmapData.map(item => item[0]))];
    const cols = [...new Set(heatmapData.map(item => item[1]))];

    // compile all probabilites into a matrix by x-y index
    const values = rows.map(row => {
        return cols.map(col => {
            const cell = heatmapData.find(item => item[0] == row && item[1] == col);
            return cell[3];
        });
    });

    // add hovertext for every cell in the above matrix
    const text = rows.map(row => {
        return cols.map(col => {
            const cell = heatmapData.find(item => item[0] == row && item[1] == col);
            return `<b>state: |${cell[0]}${cell[1]}〉</b><br>amp: ${cell[2]}<br>prob: ${cell[3]}`;
        });
    });

    return [rows, cols, values, text];
}

/**
 * Create a fresh div for a new plot, respecting
 * the given dimensions.
 * @param {*} id The element's id.
 * @param {*} height The desired height in pixels.
 * @param {*} width The desired width in pixels.
 * @returns A reference to the created element.
 */
export function createPlotCanvas (id, height, width) {
    const canvas = document.createElement('div');

    canvas.style.height = height + 'px';
    canvas.style.width = width + 'px';
    canvas.style.display = 'none';
    canvas.id = id;

    return canvas;
}

/**
 * Traditional assert function. Throws error if the given condition
 * is unsatisfied.
 * @param {*} condition A factoid; throw if its promise is broken.
 * @param {*} message The error message to show.
 */
export function assert (condition, message) { 
    if (!condition) throw 'Assertion promise breached' (message ? ':' + message : '');
}

/**
 * Enable/Disable the run button based on whether 
 * errored gates currently exist on the circuit.
 */
export function toggleRunButton () {
    const runButton = document.getElementById('runButton');
    if (Gate.erroredGates > 0) {
        runButton.disabled = true;
        runButton.title = 'The circuit contains errored gates!';
    }
    else {
        runButton.disabled = false;
        runButton.title = 'Prepare the circuit for execution (CTRL + X)';
    }
}

/**
 * Plot the counts histogram plot on the given container
 * based on the given results.
 * @param {*} container The container to paint the plot in.
 * @param {*} results The counts results of the experiment.
 * @returns A reference to the created canvas object.
 */
export function createCountsPlot(container, results) {
    const canvas = createPlotCanvas(
        'canvasCounts', 
        container.clientHeight,
        container.clientWidth
    );
    container.appendChild(canvas);

    Plotly.newPlot('canvasCounts', [{
        x: Object.keys(results.counts),
        y: Object.values(results.counts),
        type: 'bar',
        orientation: 'v',
        marker: { color: 'lightgreen' }
    }],{
        title: 'Counts',
        margin: { l: 50, r: 30, b: 50, t: 65, pad: 10 },
        xaxis: {
            autotypenumbers: 'strict',
            tickangle: 60,
    }});

    return canvas;
}

/**
 * Plot the amplitudes heatmap plot on the given container
 * based on the given results.
 * @param {*} container The container to paint the plot in.
 * @param {*} results The calculated amplitudes of the experiment.
 * @returns A reference to the created canvas object.
 */
export function createAmpsPlot(container, results) {
    const canvas = createPlotCanvas(
        'canvasAmps', 
        container.clientHeight,
        container.clientWidth
    );
    container.appendChild(canvas);

    const [y, x, z, text] = data2heatmap(results.amplitudes, results.probabilites);

    Plotly.newPlot('canvasAmps', [{
        y: y.map(item => item + '_'),
        x: x.map(item => '_' + item),
        z: z,
        hoverinfo: 'text',
        text: text,
        type: 'heatmap',
        colorscale: 'Greens',
        reversescale: true,
        xgap: 5,
        ygap: 5,
        zmin: 0,
        zmax: 1
    }], {
        title: 'Amplitude matrix',
        hoverlabel: { align: 'left' },
        margin: { l: 50, r: 30, b: 50, t: 65, pad: 10 },
        yaxis: { autotypenumbers: 'strict', },
        xaxis: { autotypenumbers: 'strict',
                tickangle: 90,             },
    });

    return canvas;
}

/**
 * Plot the unitary matrix plot on the given container
 * based on the given results.
 * @param {*} container The container to paint the plot in.
 * @param {*} results The unitary matrix of the experiment.
 * @returns A reference to the created canvas object.
 */
export function createUnitaryPlot(container, results) {
    const canvas = createPlotCanvas(
        'canvasUnitary', 
        container.clientHeight,
        container.clientWidth
    );
    container.appendChild(canvas);

    Plotly.newPlot('canvasUnitary', [{
        z: results.unitary_squares,
        hoverinfo: 'text',
        text: results.unitary,
        type: 'heatmap',
        colorscale: 'Greens',
        showscale: false,
        reversescale: true,
        xgap: 5,
        ygap: 5,
        zmin: 0,
        zmax: 1
    }], {
        title: 'Unitary matrix',
        yaxis: { autorange: 'reversed'},
        margin: { l: 50, r: 30, b: 50, t: 65, pad: 10 },
    }, {
        modeBarButtonsToAdd: [{
            name: 'downloadMatrix',
            icon: Plotly.Icons.disk,
            click: () => {
                const blob = new Blob(
                    // jsonify the unitary matrix, remove the "" characters
                    // and change line for each new row
                    [JSON.stringify(results.unitary).replace(/"/g, '').replace(/\],/g, '],\n ')],
                    { type: 'text/plain' }
                );
                const url = URL.createObjectURL(blob);

                // Create a temporary link element and trigger the download
                const a = document.createElement('a');
                a.href = url;
                a.download = 'unitary_matrix.txt';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }]
    });

    return canvas;
}