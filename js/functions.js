import * as Constants from './constants.js'

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