import { Gate, InertiaGate, Measurement } from "./gates";
import { Circuit, STEP_SIZE } from "./circuit";

/**
 * Qubits have their state changed by continuous application of quantum gates.
 * 
 * Graphically, they're represented as a starting state followed by a horizontal wire.
 */
export class Qubit {
    public readonly body: HTMLElement;  // qubit container element
    public readonly gates: Gate[];      // gate array 'train'
    public readonly wire: HTMLElement;  // qubit wire element
    public readonly state: HTMLElement; // qubit state display element
    public readonly parent: Circuit;    // reference to the circuit this qubit belongs in 
    public registerColor: string;       // current register color of ket display
    private pivot: number;              // position where the qubit changes to bit

    // lists of available register colors and states
    private static readonly colors = [
        'transparent', 
        'rgb(0, 150, 70)',   // green
        'rgb(30, 210, 140)', // neon
        'rgb(0, 190, 190)',  // cyan
        'rgb(0, 128, 190)',  // blue
        'rgb(120, 0, 240)'   // purple
    ];

    public static imaginaryUnit = 'i';

    constructor (parent: Circuit, startingInertias = 0) {
        this.gates = [];
        this.body = $('#template-qubit')
            .clone()
            .css('visibility', 'visible')
            .removeAttr('id')
            .get(0)!;
        this.parent = parent;
        this.wire  = $(this.body).find('wire').get(0)!;
        this.state = $(this.body).find('state').get(0)!;
        this.registerColor = Qubit.colors[0];
        this.pivot = -1;

        const alias = $(this.body).find('state').get(1)!;

        $(alias)
            // CHANGE QUBIT ALIAS
            .on('dblclick', () => {
                this.parent.save();
                $(alias).find('input')
                    .css('background-color', 'var(--background-color)')
                    .trigger('focus');
            })
        .find('input')
            .on('input', () => { // GROW/SHRINK ALIAS BOX
                const inputBox = $(alias).find('input'), value = inputBox.val();
                const MAX_LENGTH = 150, STEP = 16;

                if (value !== undefined && value.length > 0) 
                    inputBox.css('width', `${Math.min(value.length * STEP, MAX_LENGTH)}px`);
                else 
                    // fall back to the length of the placeholder as default case
                    inputBox.css('width', `${(inputBox.attr('placeholder') || '').length * STEP}px`);
            })
            .on('blur', () => {
                $(alias).find('input').css('background-color', 'transparent');
                this.parent.refresh();
            })
            .trigger('input'); // and trigger the growth immediately to account for it

        $(this.state).on('click', (e) => { // CHANGE STATE/COLOR
            this.parent.save();
            this.shuffleState(e);
            this.shuffleRegister(e);
            this.parent.refresh();
        });

        $(this.body).find('.delete-qubit').on('click', () => { // REMOVE QUBIT
            this.parent.save();
            this.parent.removeQubit(this); 
            this.parent.refresh();
        });

        // if asked for more than 0 starting inertias, attempt to place an inertia at 
        // position `startingInertias - 1`. `attach` will fill the rest of the gate train.
        if (startingInertias) this.attach(new InertiaGate(this.parent), startingInertias - 1);
    }

    /**
     * Checks whether the gate train is empty or consists of only identities.
     * @returns `true` if the above is true.
     */
    public get empty (): boolean {
        return (
            this.gates.length < 1 ||
            this.gates.every(gate => gate instanceof InertiaGate));
    }

    /**
     * Returns the current *given* name (**not** the placeholder) of this qubit.
     */
    public get alias (): string {
        const alias = $(this.body).find('state').get(1)!;
        const inputBox = $(alias).find('input');

        return inputBox.val() || '';
    }

    /**
     * Sets the name of this qubit to `name`.
     */
    public set alias (name: string) {
        const alias = $(this.body).find('state').get(1)!;
        
        // update name and width 
        $(alias).find('input').val(name).trigger('input');
    }

    public set placeholder (name: string) {
        const alias = $(this.body).find('state').get(1)!;
        
        // update placeholder and width 
        $(alias).find('input').attr('placeholder', name).trigger('input');
    }

    /**
     * Returns the gate at position `index`. Works for the range [-length, length).
     * Negative indeces means going backwards from the last entry.
     * @param index The position of the `Gate` entry to return.
     * @returns A `Gate` object if the given `index` is in-bounds; `null` if not or the `index` is a non-integer.
     */
    public gate (index: number): Gate | null {
        if (!Number.isInteger(index) || this.gates.length === 0) 
            return null;
        if (0 <= index && index < this.gates.length) 
            return this.gates[index];
        if (-this.gates.length <= index  && index < 0) 
            return this.gates[this.gates.length + index];

        return null;
    }

    /**
     * On click, changes the qubit ket state to the next in line.
     * If SHIFT is pressed, reverts to default (|0>).
     * @param event The click event that proc-ed this behavior.
     * @param step Defaults to 1. If 0, it will attempt to paste the same texture. This is useful
     *             for when changing `i` to `j` or vice versa for the imaginary unit. Passing 0 ignores `event`.
     */
    public shuffleState (event: JQuery.ClickEvent | undefined, step: 0 | 1 = 1): void {
        if (step === 1 && event && event.ctrlKey) return;

        const states = ['0', '1', '+', '-', `+${Qubit.imaginaryUnit}`, `-${Qubit.imaginaryUnit}`];

        if (step === 1 && event && event.shiftKey) {
            this.state.textContent = states[0];
            return;
        }

        const current = this.state.textContent!.replace(/[ij]/g, Qubit.imaginaryUnit);
        const argstate = states.indexOf(current);
        this.state.textContent = `${states[(argstate + step) % states.length]}`;
    }

    /**
     * On CTRL + click, changes the qubit register color to the next in line.
     * If SHIFT is pressed, reverts to default (transparent).
     * @param event The click event that proc-ed this behavior.
     */
    private shuffleRegister (event: JQuery.ClickEvent): void {
        if (!event.ctrlKey) return;

        if (event.shiftKey) {
            this.registerColor = Qubit.colors[0];
            this.parent.drawRegisters();
            return;
        }

        const argcolor = Qubit.colors.indexOf(this.registerColor);
        this.registerColor = Qubit.colors[(argcolor + 1) % Qubit.colors.length];
        this.parent.drawRegisters();
    }

    /**
     * Glues `gate` ontop of this qubit wire. This affects the HTML elements
     * only and doesn't actually attach the gate ontop of the qubit object.
     * @param gate The gate object to snap on this qubit.
     * @param position (index-like) The position ontop of the qubit wire to snap the gate on.
     */
    public snap (gate: Gate, position: number): void {
        if (!$.contains(this.body, gate.body)) $(this.body).append(gate.body);

        $(gate.body).css({
            left: `${99.5 + position * (10 + 40)}px`,
            top: `${-7.5}px`
        });
        // re-hide borders for textured gates
        gate.banishBorder();
    }

    /**
     * Checks if the mouse cursor is currently hovering this qubit.
     * @param event The mouse event that proc-ed this behavior.
     * @returns True if the cursor hovers the bounding client rectangle of this qubit.
     */
    public hovered (event?: JQuery.MouseEventBase): boolean {
        if (event === undefined) return false;

        const rect = this.body.getBoundingClientRect();

        return rect.top    <= event.clientY 
            && rect.bottom >= event.clientY 
            && rect.left    < event.clientX
            && rect.right   > event.clientX
    }

    /**
     * Turns this qubit wire into a bit (double line) from `position` onwards.
     * @param position (index-like) The position to start the texture change.
     */
    public collapse (position: number): void {
        this.pivot = position;
        // translate the index position to pixels
        const OFFSET = 35, pxPivot = OFFSET + this.pivot * STEP_SIZE;
        
        $(this.wire).css({
            background: `linear-gradient(to right, var(--text-color) ${pxPivot}px, var(--background-color) ${pxPivot}px)`,
            borderImage: `linear-gradient(to right, var(--background-color) ${pxPivot}px, var(--text-color) ${pxPivot}px) 1`            
        });
    }

    /**
     * Checks if the qubit is a double line on index `position`.
     * @param position (index-like) The position ontop of the qubit wire to check.
     * @returns True if the wire on `position` is a double line.
     */
    public bit (position: number): boolean {
        return this.pivot > -1 && position > this.pivot;
    }

    /**
     * Scans this qubit's gate train for measurement gates. At most one can be found.
     * If so, collapses the qubit from that position onwards.
     * If none are found, reverts the qubit wire to its default state.
     * @param ignore A gate that, if found on the gate train, should be ignored.
     * @param start The index to begin the search from.
     * @param step The index increment for the gate positions.
     * @param stop If specified, this index is included in the search. If not, it defaults to the length of the gate train.
     */
    public scanForMeasurement (ignored?: Gate, start: number = 0, step: number = 1, stop?: number): void {
        for (let i = start; i < (stop !== undefined ? stop + 1 : this.gates.length); i += step)
            if (i === stop || (
                Number.isInteger(i) &&
                i < this.gates.length && 
                this.gates[i] !== ignored && 
                this.gates[i] instanceof Measurement
            )) {
                this.collapse(i);
                return;
            }
        // if this point is reached, there are no measurements ontop of this qubit.
        // revert to default.
        this.pivot = -1;

        $(this.wire).css({
            background: 'var(--text-color)',
            borderImage: 'none'
        });
    }

    /**
     * Re-snaps all gates on the gate train to their index position.
     */
    public reorder (): void {
        for (let i = 0; i < this.gates.length; i++) this.snap(this.gates[i], i);

        // measurements could have moved, redraw double line
        this.scanForMeasurement();
    }

    /**
     * Returns the index of `gate` on the gate train array, if found.
     * @param gate The Gate object to look up.
     * @returns Index-like position if found; `null` otherwise.
     */
    public find (gate: Gate): number | null {
        for (let i = 0; i < this.gates.length; i++) if (this.gates[i] === gate)
            return i;

        return null;
    }

    /**
     * Attaches `gate` on this qubit on index `position`, 
     * including it on the gate train. The new gate can override the last
     * occupant of this position, should that be specified.
     * @param gate The gate to attach.
     * @param position The position to attach the gate on.
     * @param override If true, pastes `gate` over existing `InertiaGate` objects.
     */
    public attach (gate: Gate, position: number, override?: boolean): void {
        gate.owner = this;

        if (!override)
            // pad with inertia gates till length reaches the position
            while (position > this.gates.length) {
                const padding = new InertiaGate(this.parent);
                padding.owner = this;
                this.gates.splice(position, 0, padding);
            }
        // add the new gate and collect the discarded (if any)
        const discarded = this.gates.splice(position, override ? 1 : 0, gate);
        // erase the discarded gate from the DOM (at most one)
        for (const trash of discarded) trash.erase();
        // re-print the gate train
        this.reorder();
    }

    /**
     * Deatches `gate` from this qubit, removing it from the gate train,
     * if it exists in it. 
     * @param gate The Gate object to detach.
     * @param erase Pass `true` to destroy this `gate` after detaching it.
     * @returns (index-like) The position `gate` occupied before removal if it existed; null otherwise.
     */
    public detach (gate: Gate | null, erase?: boolean): number | null {
        if (!gate || gate.owner !== this) return null;

        // find and remove the gate from the gate train
        const position = this.find(gate)!;
        this.gates.splice(position, 1); 

        // if it wasnt an inertia gate, leave one behind for integrity
        // if it turns out to be unnecessary it will be discarded by refresh
        if (!(gate instanceof InertiaGate)) {
            const  remnant = new InertiaGate(this.parent);
            remnant.owner = this;
            this.gates.splice(position, 0, remnant);
        }

        if (erase) gate.erase();

        // re-snap remaining gates to correct positions
        this.reorder();

        return position;
    }

    /**
     * Empties the qubit and deletes it from the DOM, if specified.
     */
    public clear (fully?: boolean): void {
        while (this.gates.length > 0) this.gates.pop()?.erase();
        
        this.scanForMeasurement();
        if (fully) 
            $(this.body).remove();
    }
}