import { Circuit } from "./circuit";
import { Qubit } from "./qubit";
import { Template } from "./template";
import { calculate } from "./functions";

const DELIMITER: string = '<!@DELIMITER>';

/**
 * Generic Gate definition.
 */
export class Gate {
    public readonly span: number;      // number of qubits this gate encompasses
    public readonly body: HTMLElement; // gate element
    public readonly type: string;      // id of passed gate template
    public readonly circuit: Circuit;  // reference to the circuit this gate belongs in
    public owner: Qubit | undefined;   // reference to the qubit where this gate sits on
    public dragging: boolean;          // flag for keeping track of dragged gates
    protected errored: boolean;        // flag for labeling gates are errored

    public static generics: number     = 0; // #generics (not swaps, controls, measurements or inertias)
    public static swaps: number        = 0; // #swaps
    public static measurements: number = 0; // #measurements
    public static errors: number       = 0; // #errored gates
    public static controls: number     = 0; // #controls
    public static identities: number   = 0; // #inertias

    constructor (template: HTMLElement, circuit: Circuit, span: number = 1) {
        this.span = span;
        this.body = $(template).clone().get(0)!;
        this.type = template.id;
        this.circuit = circuit;
        this.errored = false;
        this.owner = undefined;
        this.dragging = false;

        $(this.body).css({
            position: 'absolute',
            height: `${this.span * 40 + (this.span - 1) * 19}px`
        })
        .on('mousedown', (e) => {
            if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.altKey) return;

            this.dragNdrop();
        })
        .on('contextmenu', (e) => { // FAST DELETE GATE
            // activate only on left click
            if (e.altKey || e.shiftKey || e.ctrlKey || e.button !== 2) return;

            e.preventDefault();

            this.circuit.save();
            this.circuit.detach(this);
            this.erase();
            this.circuit.refresh();
        })
        .on('click', (e) => { // FAST COPY GATE
            // activate only if either SHIFT or CTRL are pressed, not both and not neither
            if (e.shiftKey == e.ctrlKey) return;

            const step = this.owner?.find(this);
            // perform a check to validate that this gate exists and is placed
            if (step === null || step === undefined) return;

            this.circuit.save();
            const copy = Gate.from(this.stamp, this.circuit); 
            const index = this.circuit.find(this.owner!) as number;

            if (e.ctrlKey) {
                // the last qubit index that holds a gate prior to change
                // the conditional guarantees that empty qubits that exists due to limit are considered
                const lastGateIndex = this.circuit.qubits.length - (this.circuit.qubit(-1)!.gates.length > 0 ? 1 : 2);
                // add span new qubits, as the copy gate needs to jump span positions downward
                for (let i = 0; i < this.span; i++) this.circuit.addQubit();
                for (let i = lastGateIndex; i > index + this.span; i--) {
                    // move every existing non-trivial gate (occupant) span positions downward, from the bottom up
                    const other = this.circuit.qubit(i)!;
                    const occupant = other.gate(step);
                    if (occupant && !(occupant instanceof InertiaGate || occupant instanceof Support)) {
                        this.circuit.detach(occupant);
                        this.circuit.attach(occupant, i + this.span, step);
                    }
                }
            }
            // include the copy to the correct position according to invocation
            this.circuit.attach(copy!, index + (e.ctrlKey ? this.span : 0), step + (e.ctrlKey ? 0 : 0.5));
            this.circuit.refresh();
        })
        .find('description').remove();

        // make long symbols on tall gates vertical to make use of the extra space
        if (this.body.textContent!.length > 2 && this.span > 1)
            $(this.body).css('writing-mode', 'vertical-rl');

        $(document.body).append(this.body);
    }

    /**
     * JSON-parsable description of Gate.
     */
    public get stamp (): string {
        return this.type;
    }

    /**
     * Moves `Gate` element to new pixel position.
     * New position is offset by half the dimensions of the `Gate`.
     * 
     * @param pixelsX Amount of pixels to move left.
     * @param pixelsY Amount of pixels to move up.
     */
    public move (pixelsX: number, pixelsY: number): void {
        if (this.body.parentElement !== document.body) $(document.body).append(this.body);

        const rect = this.body.getBoundingClientRect();

        this.body.style.left = `${pixelsX - rect.width / 2}px`;
        this.body.style.top  = `${pixelsY - rect.height / 2}px`;
    }

    /**
     * Removes `Gate` element from the DOM.
     */
    public erase (): void {
        if (this.errored) Gate.errors--; 

        $(this.body).remove();
    }

    /**
     * Hides `Gate` border if it sports a texture.
     * @returns `true` if the border was hidden, `false` otherwise.
     */
    public banishBorder (): boolean {
        // generic gates don't have specific textures
        return false;       
    }

    /**
     * Changes appearance to the alternate one.
     * @param textured Swap to textured mode?
     * @param updateFlag If `true`, updates the appearance flag according to the change.
     * @returns `true` if the change was successful.
     */
    public alternate (textured = false, updateFlag = true): boolean {
        // generic gates don't have alternate appearances
        return false;
    }

    /**
     * Shows `Gate` border with specified background and border colors.
     * @param background The background color to apply.
     * @param border The border color to apply.
     */
    public summonBorder (background: string = 'var(--background-color)', border: string = 'var(--text-color)'): void {
        this.body.style.backgroundColor = background;
        this.body.style.border = `1px solid ${border}`;
    }

    /**
     * Labels `Gate` as `errored`. `Errored Gates` have their border
     * shown with red color.
     * @param reason (Optional) Message explaining the error.
     */
    public error (reason = ''): void {
        if (this.errored) return;

        this.errored = true;
        Gate.errors++;

        $(this.body)
            .addClass('errored')
            .attr('title', reason);
    }

    /**
     * Removes error label from `Gate`. Border is hidden
     * if the `Gate` is textured, otherwise it returns to normal.
     */
    public unerror (): void {
        if (!this.errored) return;

        this.errored = false;
        Gate.errors--;

        $(this.body)
            .removeClass('errored')
            .removeAttr('title');
    }

    /**
     * Checks `this` gate for errors. In the generic case, a `Gate` is error-prone
     * if it is placed ontop of a collapsed `Qubit` (i.e. a bit).
     */
    public validate (): void {
        if (this.owner?.bit(this.owner.find(this) as number))
            this.error('This gate cannot exist ontop of a bit.');
    }

    /**
     * Initiates drag and drop behavior on `this` gate. The `Gate` is bound to the mouse
     * and follows it around so long as `mousedown` is active. Proc-ing `mouseup` while
     * drop the `Gate`, either adding it to the circuit if applicable or deleting it.
     */
    public dragNdrop (): void {
        this.dragging = true; // initiate dragging
        this.circuit.addQubit(); // preemptively append a new qubit
        this.circuit.extend(1);  // extend all qubits one place to the left
        this.circuit.drawBorders(undefined, this); // update postselection borders to account for the new qubit
        this.circuit.updateOrder() // account for the new qubit

        const drag = (e: JQuery.MouseEventBase) => {
            if (!this.dragging) return;

            // update measurement lines, ignoring the dragged gate
            for (const qubit of this.circuit.qubits) qubit.scanForMeasurement(this);
            // update connectors, ignoring the dragged gate
            this.circuit.drawConnectors(undefined, this);
            // localize the dragged gate on the circuit
            const [relpos, index] = this.circuit.localize(e, this);

            if (index === null) {
                // keep moving if not hovering a qubit
                this.move(e.clientX, e.clientY);
                return;
            }

            const qubit = this.circuit.qubits[index];
            qubit.snap(this, relpos); // preemptively snap on the hovered qubit

            // if hovering a measurement, update the double line to start from the hovered element
            // only if it is the first measurement in line on the gate train
            if (this instanceof Measurement) qubit.scanForMeasurement(this, -0.5, 0.5, relpos);
        };

        const drop = (e: JQuery.MouseEventBase) => { 
            if (!this.dragging) return;

            const snapshot = new Template(this.circuit, { stacks: false, });
            this.dragging = false; // terminate dragging
            this.banishBorder(); // reapply textures for textured gates
            this.circuit.detach(this); // remove the hovered gate from its previous position (if any)

            // attach the hovered gate on the appropriate position if hovering a qubit,
            // otherwise discard it
            const [relpos, qubit] = this.circuit.localize(e, this);
            if (qubit !== null) this.circuit.attach(this, qubit, relpos!);
            else this.erase();

            // save the previous snapshot and refresh
            this.circuit.save(snapshot);
            this.circuit.refresh();
            
            $(document).off('mousemove', drag).off('mouseup', drop);    
        };
    
        $(document).on('mousemove', drag).on('mouseup', drop);
    }

    /**
     * Creates a new `Gate` object using the constructor specified by `id`.
     * @param stamp The original gate's stamp, containing the HTMLElement id and gate specific extra info.
     * @param parent The circuit this `Gate` exists in.
     * @returns The new `Gate` object, if `id` is found; `null` otherwise.
     */
    public static from (stamp: string, parent: Circuit): Gate | null {
        const [id, extra] = stamp.split(DELIMITER);

        const DEFAULTS: Record<string, new (parent: Circuit) => Gate> = {
            'measurement': Measurement,
            'control': Control,
            'inertia': InertiaGate,
            'swap': SWAPGate,
            'x': XGate,
            'y': YGate,
            'z': ZGate,
            'h': HGate,
            's': SGate,
            't': TGate,
            'powered-x': PoweredXGate,
            'powered-y': PoweredYGate,
            'powered-z': PoweredZGate,
        };

        // if a custom instance of an existing gate element then return custom
        if (!DEFAULTS[id]) return $(`#${id}`).length > 0 ? new Custom(id, parent) : null;

        const gate = new DEFAULTS[id](parent);

        if (extra && gate instanceof PoweredGate)
            // carry over the exponent if the original had one
            (gate as PoweredGate).powerBox.value = extra;

        if (extra && gate instanceof Measurement) {
            // remember postselection mode
            (gate as Measurement).mode = parseInt(extra);
            (gate as Measurement).applyMode(parseInt(extra));
        }

        if (extra && gate instanceof Control) {
            // remember control mode
            (gate as Control).mode = parseInt(extra);
            (gate as Control).applyMode(parseInt(extra)); 
        }
        
        return gate;
    }
}

/**
 * `Textured Gate` objects sport unique textures instead of
 * letter symbols.
 */
class TexturedGate extends Gate {
    /**
     * Hides the border and the background of the `Gate`.
     * @returns `true` always, as it has a non-trivial effect.
     */
    public override banishBorder (): boolean {
        this.body.style.backgroundColor = 'transparent';
        this.body.style.border = 'none';

        return true;
    }
}

/**
 * Powered Gates include input boxes that should be dealt with differently.
 */
export class PoweredGate extends Gate {
    public readonly powerBox: HTMLInputElement; // HTML input box element for the exponents

    constructor (template: HTMLElement, circuit: Circuit) {
        super(template, circuit);
        this.powerBox = $(this.body).find('.power')
            .css('pointer-events', 'auto')
            .get(0) as HTMLInputElement;

        Gate.generics++;

        $(this.powerBox).on('input', () => {
            // re-validate this gate when its exponent changes
            this.unerror();
            this.validate();
            // toggle buttons again based on new context
            this.circuit.toggleButtons();
        });
    }

    /**
     * JSON-parsable description of `this` gate.
     * Includes the `type` of the `Gate` and its current `exponent`, seperated
     * by a delimiter.
     */
    public override get stamp (): string {
        return `${this.type}${DELIMITER}${this.powerBox.value}`;
    }

    /**
     * Overloaded validate version. Non-numerical exponents is also an error for `PoweredGate` objects.
     *  Checks this case too after the generic one.
     */
    public override validate (): void {
        // check the generic case first
        super.validate();
        // test the given exponent. If NaN, error.
        if (Number.isNaN(calculate(this.powerBox.value))) 
            this.error('Invalid exponent.'); 
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Measurements are "gates" that collapse the qubit superposition.
 * They can apply postselection.
 * 
 * Graphically they are represented as a Geiger counter -like symbol.
 */
export class Measurement extends Gate {
    public mode: number; // 2: default, 0: postselection on |0>, 1: postselection on |1>

    constructor (circuit: Circuit) {
        super($('#measurement').get(0)!, circuit);
        this.mode = 2;

        Gate.measurements++;

        // change postselection mode on ALT+click
        $(this.body).on('click', (e) => {
            // fire only on alt click and if not errored
            if (this.errored || !e.altKey || e.button !== 0 || e.shiftKey || e.ctrlKey) return;
            
            this.circuit.save();
            
            // move to the next display mode in line
            this.mode = (this.mode + 1) % 3;
            
            this.applyMode(this.mode);
        });
    }

    public applyMode (which: number): void {
        switch (which) {
            case 2:
                // hide the ket display and bring the arrow to the vertical position
                $(this.body).find('.ket')
                    .css('display', 'none');
                $(this.body).find('.arrow')
                    .removeClass('tilted-left')
                    .removeClass('tilted-right');
                break;
            case 0:
                // reveal the ket display on state 0 and tilt the arrow to the right
                $(this.body).find('.ket')
                    .css('display', 'block')
                    .text('0');
                $(this.body).find('.arrow')
                    .removeClass('tilted-left')
                    .addClass('tilted-right');
                break;
            case 1:
                // reveal the ket display on state 1 and tilt the arrow to the left
                $(this.body).find('.ket')
                    .css('display', 'block')
                    .text('1');
                $(this.body).find('.arrow')
                    .removeClass('tilted-right')
                    .addClass('tilted-left');
                break;
        }
        // spawn or delete the border according to the above change
        this.circuit.drawBorders();
    }
    
    /**
     * JSON-parsable description of `Gate`. Includes `this` gate's `type` and its
     * current postselection `mode`, seperated by a delimiter.
     */
    public override get stamp (): string {
        return `${this.type}${DELIMITER}${this.mode}`;
    }

    public override erase (): void {
        Gate.measurements--;
        super.erase();
    }
}

/**
 * Controls connect with the entire step to block its execution
 * unless its value is satisfying.
 * 
 * Graphically, they are represented as a colored or transparent dot.
 */
export class Control extends TexturedGate {
    public mode: number; // 1: satisfies on |1>, 0: satisfies on |0>

    private static readonly modes = ['◦', '•'];

    constructor (circuit: Circuit) {
        super($('#control').get(0)!, circuit);
        this.mode = 1;
        
        Gate.controls++;

        $(this.body)
        .addClass('textured')
        // change control activation mode on ALT+click
        .on('click', (e) => {
            // fire only on alt click
            if (!e.altKey || e.button !== 0 || e.shiftKey || e.ctrlKey) return;

            this.circuit.save();
            this.mode = (this.mode + 1) % Control.modes.length;

            // toggle between normal and anti-control
            this.applyMode(this.mode);
        });
    }

    public applyMode (which: number): void {
        if (which >= Control.modes.length) return;

        $(this.body).find('.control-front').text(Control.modes[which]);
    }

    /**
     * JSON-parsable description of `Gate`. Includes `this` gate's `type` and
     * its current activation `mode`, seperated by a delimiter.
     */
    public override get stamp (): string {
        return `${this.type}${DELIMITER}${this.mode}`;
    }

    public override erase (): void {
        Gate.controls--;
        super.erase();
    }

    /**
     * `Control` objects cannot be errored. This does nothing.
     */
    public override validate (): void {
        // cannot error control gates
        return;
    }
}

/**
 * Custom gate constructor. Make sure the passed id actually corresponds
 * to a loaded HTMLElement, otherwise this throws.
 */
export class Custom extends Gate {
    constructor (HTMLid: string, circuit: Circuit) {
        const template = $(`#${HTMLid}`).get(0)!;
        const span = parseInt($(template).attr('span')!);

        super(template, circuit, span);

        $(this.body).css('display', 'inline-flex');
        
        Gate.generics++;
    }

    public erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Supports are invisible "gates" that pad the tail of
 * custom gates so that other gates can't clip inside them.
 * 
 * They are fake elements that are not represented and have no effect at all.
 */
export class Support extends Gate {
    constructor (parent: Gate, circuit: Circuit) {
        super(
            $('#supp').clone()
                .attr('id', `supp:${parent.body.id}`)
                .get(0)!, circuit);
    }
}

/**
 * Inertia gates (or "Identity gates") have no effect on the 
 * qubit they're applied.
 * 
 * They are usually not represented graphically, but when they are,
 * they appear as a normal gate with a 'I' label.
 */
export class InertiaGate extends Gate {
    constructor (circuit: Circuit) {
        super($('#inertia').get(0)!, circuit);

        Gate.identities++;

        // inertias should not be interactable
        $(this.body)
            .off('mousedown')
            .off('contextmenu')
            .off('click');
    }

    public override erase (): void {
        Gate.identities--;
        super.erase();
    }

    /**
     * `Inertia` gates cannot be errored. This does nothing.
     */
    public override validate (): void {
        // cannot error identity gates
        return;
    }
}

/**
 * SWAP gates affect two qubits simultaneously and swap their current states.
 * 
 * Graphically, they are represented as two crosses connected by a vertical line.
 */
export class SWAPGate extends TexturedGate {
    constructor (circuit: Circuit) {
        super($('#swap').get(0)!, circuit);

        Gate.swaps += 0.5; // technically, two `SWAPGate` objects are needed for a complete gate to count

        $(this.body).addClass('textured');
    }

    /**
     * Overloaded validate version. `SWAP` gates are error-prone if there are more than two
     * or only a single one in a given column. Tests this case too after the generic one.
     * 
     * Note that this errors all eligible `SWAP` gates found in a column (don't overuse).
     */
    public override validate (): void {
        // perform generic test first
        super.validate();

        // argsearch this gate to find the #col
        const col = this.owner?.find(this) as number;
        const swaps: SWAPGate[] = [];

        // collect all swaps found in this column
        for (const qubit of this.circuit.qubits)
            if (qubit.gate(col) instanceof SWAPGate)
                swaps.push(qubit.gate(col) as SWAPGate);
        
        // if more than two, error *all* of them, with the appropriate message
        if (swaps.length !== 2)
            for (const gate of swaps)
                gate.error(
                    swaps.length > 2 ? 
                    'Too many SWAP gates on this step.' : 
                    'SWAP gates need a pair on their step.');
    }

    public override error (reason = ''): void {
        if (this.errored) return;

        Gate.swaps -= 0.5; // since non-paired SWAPS become errored, this hides half-swaps from the gate count
        super.error(reason);
    }

    public override unerror (): void {
        if (!this.errored) return;

        Gate.swaps += 0.5;
        super.unerror();
    }

    public override erase (): void {
        if (!this.errored) Gate.swaps -= 0.5;
        
        super.erase();
    }
}

/**
 * X Pauli Gates, or NOT gates, flip the qubit state on the x-axis in the Bloch Sphere.
 */
export class XGate extends TexturedGate {
    private target: boolean;

    constructor (circuit: Circuit) {
        super($('#x').get(0)!, circuit);

        Gate.generics++;

        $(this.body)
            .addClass('textured')
            .on('mouseenter', () => { this.alternate(false, false); })
            .on('mouseleave', () => { this.alternate(this.target, false); });

        this.target = false;
    }

    /**
     * Changes appearance from X to target and vice versa.
     * @param textured If `true`, forces the `target` display.
     * @param updateFlag If `false`, the internal display flag is not updated.
     * @returns `true` always, as it has a non-trivial effect.
     */
    public override alternate (textured = false, updateFlag = true): boolean {
        $(this.body).find('span')
            .css('display', textured ? 'block' : 'none');
        
        $(this.body).find('.label').css('display', textured ? 'none' : 'block');

        if (updateFlag) this.target = textured;

        if (textured) this.banishBorder(); else this.summonBorder();

        return true;
    }

    /**
     * Hides the border completely, but only if the display is currently on `target` mode.
     * @returns `true` if the change was successful.
     */
    public override banishBorder (): boolean {
        if (this.target) super.banishBorder();

        return this.target;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Z Pauli Gates flip the qubit state on the z-axis in the Bloch Sphere.
 */
export class ZGate extends TexturedGate {
    private dot: boolean;

    constructor (circuit: Circuit) {
        super($('#z').get(0)!, circuit);

        Gate.generics++;

        $(this.body)
            .addClass('textured')
            .on('mouseenter', () => { this.alternate(false, false); })
            .on('mouseleave', () => { this.alternate(this.dot, false); });

        this.dot = false;
    }

    /**
     * Changes appearance from Z to dot and vice versa.
     * @param textured If `true`, forces the `dot` display.
     * @param updateFlag If `false`, the internal display flag is not updated.
     * @returns `true` always, as it has a non-trivial effect.
     */
    public override alternate (textured = false, updateFlag = true): boolean {
        $(this.body).find('span')
            .css('display', textured ? 'block' : 'none');

        $(this.body).find('.label').css('display', textured ? 'none' : 'block');

        if (updateFlag) this.dot = textured;

        if (textured) this.banishBorder(); else this.summonBorder();

        return true;
    }

    /**
     * Hides the border completely, but only if the display is currently in `dot` mode.
     * @returns `true` if the change was successful.
     */
    public override banishBorder (): boolean {
        if (this.dot) super.banishBorder();

        return this.dot;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Y Pauli Gates flip the Qubit state on the y-axis in the Bloch Sphere.
 */
export class YGate extends Gate {
    constructor (circuit: Circuit) {
        super($('#y').get(0)!, circuit);

        Gate.generics++;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Hadamard Gates map basis states to ther corresponding superpositions and back.
 */
export class HGate extends Gate {
    constructor (circuit: Circuit) {
        super($('#h').get(0)!, circuit);

        Gate.generics++;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * S Gates change the phase of the qubit state by a quadrant.
 */
export class SGate extends Gate {
    constructor (circuit: Circuit) {
        super($('#s').get(0)!, circuit);

        Gate.generics++;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * T Gates change the phase of the qubit state by half a quadrant.
 */
export class TGate extends Gate {
    constructor (circuit: Circuit) {
        super($('#t').get(0)!, circuit);

        Gate.generics++;
    }

    public override erase (): void {
        Gate.generics--;
        super.erase();
    }
}

/**
 * Exponential version of the Pauli X Gate.
 */
export class PoweredXGate extends PoweredGate {
    constructor (circuit: Circuit) {
        super($('#powered-x').get(0)!, circuit);
    }
}

/**
 * Exponential version of the Pauli Y Gate.
 */
export class PoweredYGate extends PoweredGate {
    constructor (circuit: Circuit) {
        super($('#powered-y').get(0)!, circuit);
    }
}

/**
 * Exponential version of the Pauli Z Gate. Also known as the Global Phase Gate.
 */
export class PoweredZGate extends PoweredGate {
    constructor (circuit: Circuit) {
        super($('#powered-z').get(0)!, circuit);
    }
}