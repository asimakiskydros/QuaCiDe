import { Qubit } from './qubit';
import { Circuit } from './circuit';
import { Template } from './template';
import { Gate } from './gates';

/**
 * Basic mathematical evaluator than replaces `eval` for simple
 * expressions that contain only +, -, *, / and no parentheses.
 * @param expression The mathematical expression to evaluate.
 * 
 * Code heavily inspired by https://stackoverflow.com/a/75355272 and GPT.
 */
export function calculate (expression: string): number {
    // if the expression contains anything other than numbers and operators, fail
    if (!/^[\d+\-*/().\s]+$/.test(expression)) return NaN;

    // explode the expression into numbers and operators
    const parts = expression.match(/(\d+(\.\d+)?)|[+\-*/]/g);

    // if no collected parts, fail
    if (!parts) return NaN;

    // save numbers as `Number` types and operators as `String`s.
    const tokens = parts.map(el => !isNaN(Number(el)) ? Number(el) : el);
    
    const processed: number[] = [];
    // build an array with all operations reduced to additions
    for (let i = 0; i < tokens.length; i++) 
        switch (tokens[i]) {
            case '+':
                break; // ignore
            case '-':
                processed.push(-1 * (tokens[++i] as number));
                break;
            case '*': 
                processed.push(processed.pop()! * (tokens[++i] as number));
                break;
            case '/':
                processed.push(processed.pop()! / (tokens[++i] as number));
                break;
            default: 
                processed.push(tokens[i] as number);
        }
    // add all numbers and return the result
    return processed.reduce((accumulator, current) => accumulator + current, 0);
}

/**
 * Compiles the requested output name, the current circuit instance and
 * all declared custom gate definitions into a single JSON lines payload.
 * @param output The kind of output specified.
 * @param circuit The current `Circuit` object.
 * @returns JSON-lines formatted payload that starts with the output name, ends with the circuit instance
 *          and contains custom gate declarations in-between.
 */
export function payload (output: string, circuit: Circuit): string {
    const instance = [JSON.stringify({ output: output })];
    // include custom gates in order of declaration, i.e. oldest first
    // this ensures that nested declarations dont lead to errors.
    for (const gate of $('#custom-gates-panel').find('gate').not('#template-custom, #supp'))
        instance.push($(gate).attr('definition')!);

    instance.push(new Template(circuit, { 
        minQubits: false, aliases: false, colors: false, stacks: false, 
    }).json());
    
    // stitch them together into a single file where each line is a definition
    return JSON.stringify(instance.join('\n'));
}

/**
 * Triggers the plotting of the requested output.
 * @param dataType The kind of output to plot; what the `data` represent.
 * @param data The AJAX output response.
 */
export function plot (dataType: string, data: any): void {
    switch (dataType) {
        case 'counts':
            writeCounts(data);
            plotCounts(data);
            break;
        case 'amplitudes': 
            writeAmplitudes(data);
            plotAmplitudes(data);
            break;
        case 'unitary':    return;
        case 'phases':     return;
        case 'code':       return;
        default:           return;
    }
}

/**
 * Plots the given counts `data` as a bar graph.
 * @param data The data load to plot.
 */
function plotCounts (data: { state: string, counts: number }[]): void {
    const screen = $('#counts-panel')
        .find('.plot-screen')
        .css('height', `${Math.max(400, data.length * 35)}px`)
        .empty()
        .get(0)!;

    // @ts-ignore Plotly-side problem, this is necessary
    Plotly.newPlot(screen, [{
        x:    data.map(item => item.counts),
        y:    data.map(item => item.state),
        text: data.map(item => item.counts.toString()),
        textposition: 'inside',
        textfont: { color: 'white', },
        type: 'bar',
        orientation: 'h',
        marker: { color: '#007f46', },
        hovertemplate: '|%{y}⟩: %{x}<extra></extra>',
    }], {
        bargap: 0.4,
        plot_bgcolor: 'rgba(0, 0, 0, 0)',
        paper_bgcolor: 'rgba(0, 0, 0, 0)',
        height: Math.max(400, data.length * 35),
        xaxis:  { autotypenumbers: 'strict', },
        yaxis:  { autotypenumbers: 'strict', },
        margin: { l: Math.max(30, data[0].state.length * 10), b: 20, t: 20, },
    });
}

/**
 * Plots the given amplitude `data` as a probability heatmap.
 * @param data The data load to plot.
 */
function plotAmplitudes (data: { state: string, real: number, imag: number }[]): void {
    const screen = $('#amplitudes-panel')
        .find('.plot-screen')
        .css('height', `${Math.max(400, data.length * 20)}px`)
        .empty()
        .get(0)!;

    if (data.length > 1024) { // TODO: temporary solution as I investigate why the heatmap doesnt render for large datasets
        $(document.body).css('cursor', 'default');
        $(screen)
            .css('height', 'fit-content')
            .text('⚠ Dataset was too large, plotting disabled.');
        
        return;
    }

    const x = [...new Set(data.map(item => item.state.slice(0, 2)))];
    const y = [...new Set(data.map(item => item.state.slice(2)))];
    const z = y.map(suffix => x.map(prefix => {
        const item = data.find(d => d.state === prefix + suffix)!;
        return {
            prob: round(item.real * item.real + item.imag * item.imag, 4),
            label: `${item.real}+${item.imag}${Qubit.imaginaryUnit}`
        }
    }));

    // @ts-ignore Plotly-side problem, this is necessary
    Plotly.newPlot(screen, [{
        x: x,
        y: y,
        z: z.map(row => row.map(element => element.prob || null)),
        type: 'heatmap',
        hovertemplate: '|%{x}%{y}⟩: %{text}<extra></extra>',
        colorscale: [[0, '#007f46'], [0.5, 'lightgreen'], [1, '#008080']],
        ygap: 5,
        xgap: 5,
        zmin: 0,
        zmax: 1,
        // @ts-ignore I happen to know that this works like a charm, but typehinting disagrees
        text: z.map(row => row.map(element => element.label + ` (${(element.prob * 100).toFixed(2)}%)`)),
        colorbar: { outlinecolor: 'rgba(0, 0, 0, 0)', },
    }], {
        plot_bgcolor:  'rgba(0, 0, 0, 0)',
        paper_bgcolor: 'rgba(0, 0, 0, 0)',
        margin: { l: Math.max(30, data[0].state.length * 10), b: 50, t: 20, },
        xaxis:  { 
            autotypenumbers: 'strict', 
            showgrid: false,
            tickvals: x,
            ticktext: x.map(label => `${label}_`), },
        yaxis:  { 
            autotypenumbers: 'strict', 
            showgrid: false, 
            tickvals: y,
            ticktext: y.map(label => `_${label}`), },
    });
}

/**
 * Pastes the given `counts` data as raw text.
 * @param data The data load to write.
 */
function writeCounts (data: { state: string, counts: number }[]): void {
    const screen = $('#counts-panel')
        .find('.raw-screen')
        .get(0)!;
    
    let output = '';

    for (const d of data) output += `"${d.state}": ${d.counts}, `;

    $(screen).find('span').html(output);
}

/**
 * Pastes the given `amplitudes` data as raw text.
 * @param data The data load to write.
 */
function writeAmplitudes (data: { state: string, real: number, imag: number }[]): void {
    const screen = $('#amplitudes-panel')
        .find('.raw-screen')
        .get(0)!;
    
    let output = '';

    for (const d of data) output += `"${d.state}": ${d.real}+${d.imag}${Qubit.imaginaryUnit}, `;

    $(screen).find('span').html(output);
}

/**
 * Copies the passed `element` into a new `Gate` object and initializes its dragging.
 * @param element The Gate template to copy.
 * @param event The `mousedown` event that proc-ed this behavior.
 * @param circuit The `Circuit` this `Gate` belongs in.
 */
export function copy (element: HTMLElement, event: JQuery.MouseDownEvent, circuit: Circuit): void {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.altKey) 
        return;

    // create a copy of the selected gate
    const gate = Gate.from(element.id, circuit);

    if (!gate) return;

    // commence dragging
    gate.dragNdrop();
    // move the new gate to the cursor position
    gate.move(event.clientX, event.clientY);
}

/**
 * Spawns the appropriate tooltip for the hovered gate element (`parent`).
 * @param allowed Whether the current settings allow for tooltips.
 * @param parent The gate `HTMLElement`.
 * @param pointDirection Where does this tooltip's arrow point to?
 * @param topOffset How many pixels after the `parent`'s top position to sit on.
 * @param leftOffset How many pixels after the `parent`'s right position to sit on.
 * @param message The message to display on the tooltip, in raw HTML. If not given,
 *                it will be looked for inside the `parent` element.
 */
export function showTooltip (
    allowed: boolean, 
    parent: HTMLElement, 
    pointDirection: string, 
    topOffset:  number = 0,
    leftOffset: number = 0,
    message?: string, ): void 
{
    if (!allowed) return;

    const rect = parent.getBoundingClientRect();

    $(document.body).append(
        $('<tooltip></tooltip>')
            .css({
                top: rect.top + topOffset,
                left: rect.right + leftOffset
            })
            .addClass(pointDirection)
            .html(message || $(parent).find('description').html()));
}

/**
 * Custom rounding function because JS doesn't provide its own... sure, why not.
 * Rounds the given number to the specified decimal places. If not specified,
 * rounds to the nearest integer.
 * @param number The number to round.
 * @param decimals The decimal places to round to.
 */
export function round (number: number, decimals = 0): number {
    if (decimals < 0) throw new Error('Decimal places cant be negative.');

    const pad = 10 ** Math.floor(decimals);

    return Math.round((number + Number.EPSILON) * pad) / pad;
}

/**
 * Temporary replacement for `console.log` for debugging purposes,
 * as the TS->JS transpilation currently doesn't allow logging to console...
 * @param text The text to log (it appears on a hidden widget in the toolbar).
 */
export function devtoolPrint(text: string): void {
    $('#devtool').css('display', 'flex').find('span').text(text);
}