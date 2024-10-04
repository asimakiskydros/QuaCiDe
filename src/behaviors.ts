import { Circuit } from './circuit';
import { copy, devtoolPrint, payload, plot, showTooltip } from './functions';
import { Qubit } from './qubit';
import { Tab } from './tab';
import { Template } from './template';

$(() => { // on DOMContentLoaded
    const last: Record<string, Template> = {};                       // record of the last instance calculated on each output so as to avoid recalculation 
    const circuit = new Circuit();                                   // the master circuit object
    const emptyTemplate = new Template(circuit, { stacks: false, }); // the empty circuit snapshot, useful for clearing quickly
    const initialSnapshot = new Template(circuit);                   // the initial snapshot, armed with empty undo/redo stacks, useful for tab initialization
    const tabs: Tab[] = [];                                          // the tab list; the tab ribbon
    const SERVER_IP = 'http://127.0.0.1:5000';                       // the host 
    let tooltipsAllowed = true;                                      // settings flag for tooltips
    let createdGates = 0;

    /**
     * On click, spawn a fresh tab in the ribbon right before the include button.
     */
    $('#include-tab')
        // set up the event listener
        .on('click', () => { new Tab(tabs, circuit, initialSnapshot); }) 
        // then fire it immediately to spawn the initial tab
        .trigger('click');
    
    /**
     * On click, remove everything currently in the circuit and bring it back to
     * the initial instance (respecting minQubit specifications).
     */
    $('#clear')
        .on('click', () => {
            // compile the previous circuit instance
            const snapshot = new Template(circuit, { stacks: false, });
            // apply an empty circuit template to the active tab
            emptyTemplate.applyTo(circuit, { endianness: true, minQubits: true, }); 
            // save the previous snapshot
            circuit.save(snapshot);
        });

    /**
     * On click, bring the circuit to the previous instance.
     */
    $('#undo')
        .on('click', () => { circuit.load('previous'); });

    /**
     * On click, bring the circuit to the latest undone instance.
     */
    $('#redo')
        .on('click', () => { circuit.load('next'); });

    /**
     * On hover, show informative message.
     * On click, reset scrolling globally.
     */
    $('logo')
        .on('mouseenter', function () { showTooltip(tooltipsAllowed, this, 'left', 0, -50); })
        .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); })
        .on('click', () => {
            $('.gates')
                .scrollTop(0);

            $('circuit-canvas')
                .scrollTop(0)
                .scrollLeft(0);

            $('#settings-panel')
                .scrollTop(0);

            $('sidebar')
                .scrollTop(0);

            $('tab-ribbon')
                .scrollLeft(0);
        });

    /**
     * On click, toggle between Endian modes.
     * On hover, show Endian mode and contextual description tooltip.
     */
    $('#order')
        .on('click', function () {
            // toggle the active circuit's endianness
            circuit.endianness = circuit.endianness === 'Big' ? 'Little' : 'Big';
            // refresh counting
            circuit.updateOrder();
            // update the toolbar widget
            $(this).find('span').text(`Order: ${circuit.endianness} Endian`);            
            // refresh the tooltip
            $('tooltip').remove();
            $(this).trigger('mouseenter');
        })
        .on('mouseenter', function () { 
            showTooltip(tooltipsAllowed, this, 'bottom', -128, -210,
                `This register is currently in <b>${circuit.endianness} Endian</b> order.
                <br><br>Counting starts from the <b>${circuit.endianness === 'Big' ? 'bottom' : 'top'}</b>.
                <br><br>
                Click to toggle.`); 
        })
        .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); });

    /**
     * On click, toggle between available theme modes (Light and Dark).
     */
    $('#theme')
        .on('click', function () {
            let mode = 'Light';

            // toggle from one color theme to the other
            if ($(this).find('span').text() === 'Theme: Light') {
                $(document.body).addClass('dark-theme');
                mode = 'Dark';
            }
            else {
                $(document.body).removeClass('dark-theme');
                mode = 'Light';
            }
            // inform graphic of new mode
            $(this).find('span').text(`Theme: ${mode}`);
        });

    /**
     * On click, toggle between 'i' and 'j' for the imaginary unit throughout the designer.
     */
    $('#imaginary-unit')
        .on('click', function () {
            // choose the new value according to the previous one
            const imag = $(this).find('span').text() === 'Imaginary unit: i' ? 'j' : 'i';

            // save changes
            $(this).find('span').text(`Imaginary unit: ${imag}`);
            Qubit.imaginaryUnit = imag;

            // update qubit states
            for (const qubit of circuit.qubits) qubit.shuffleState(undefined, 0);
            // update toolbox gate tooltips
            for (const matrix of $('table')) $(matrix).html($(matrix).html().replace(/[ij]/g, imag));
        });

    /**
     * On click, toggle between visible and hidden inertias gates globally.
     */
    $('#hidden-inertias')
        .on('click', function () {
            let hidden = $(this).find('span').text() === 'Inertias: Hidden';

            $('.inertia').css('display', hidden ? 'inline-flex' : 'none');
            $(this).find('span').text(`Inertias: ${hidden ? 'Visible' : 'Hidden'}`);
        });

    /**
     * On click, toggle between showing tooltips on hover or not.
     */
    $('#show-tooltips')
        .on('click', function () {
            $(this).find('span').text(`Show tooltips: ${tooltipsAllowed ? 'No' : 'Yes'}`);
            tooltipsAllowed = !tooltipsAllowed;
        })

    /**
     * On double click, activate the inputbox (it spawns protected from accidental clicks).
     * On hover, show contextual tooltip.
     * On clicking away from the inputbox, set the minQubits to the appropriate value and
     * protect the inputbox again.
     */
    $('#starting-qubits')
        .on('dblclick', function () { 
            $(this).find('input')
                // background change for better visibility while typing
                .css('background-color', 'var(--background-color)')
                .trigger('focus'); 
        })
        .on('mouseenter', function () { showTooltip(tooltipsAllowed, this, 'bottom', -110, -210); })
        .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); })
    .find('input')
        .on('blur', function () {
            const value = Number(this.value);

            // update the minQubits amount only if the given value is a positive integer
            if (Number.isInteger(value) && value > 0) circuit.minQubits = value;

            // refresh the circuit to account for the new amount of qubits
            circuit.refresh();

            // reset background
            $(this).css('background-color', 'transparent');
        });

    /**
     * Same as for #starting-qubits, but for shots.
     */
    $('#shots')
        .on('dblclick', function () {
            $(this).find('input')
                .css('background-color', 'var(--background-color)')
                .trigger('focus');
        })
        .on('mouseenter', function () { showTooltip(tooltipsAllowed, this, 'bottom', -92, -210); })
        .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); })
    .find('input')
        .on('blur', function () {
            const value = Number(this.value);

            // update only if given value is a positive integer
            if (Number.isInteger(value) && value > 0) circuit.shots = value;

            circuit.refresh();

            $(this).css('background-color', 'transparent');
        });

    /**
     * On click, "bubble" the settings button upwards while revealing
     * the settings panel underneath. If the settings panel was already
     * open, close it instead.
     */
    $('#settings')
        .on('click', () => {
            if ($('#settings-panel').hasClass('bubble'))
                $('#settings-panel')
                    .removeClass('bubble')
                .parent()
                    .css('display', 'none');
            else 
                $('#settings-panel')
                    .addClass('bubble')
                .parent()
                    .css('display', 'flex');
        });
    
    /**
     * On hover, show correct tooltip.
     * On click, copy the gate and start draggging (unless inertia).
     */
    $('gate')
        .on('mouseenter', function () { showTooltip(tooltipsAllowed, this, 'left', 0, +10); })
        .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); })
    .not('#inertia')
        .on('mousedown', function (e) { copy(this, e, circuit); });

    /**
     * On click, summon the gatebuilder modal.
     */
    $('.add-custom')
        .on('click', function () {
            if ($(this).hasClass('disabled')) return;

            const aura = $('#gatebuilder-aura');
            // bug safeguard, do nothing if the gatebuilder is already summoned.
            if (aura.css('display') !== 'none') return;

            aura.css('display', 'grid');
            $('gatebuilder').css('animation', `modal-appear ${0.4}s ease`);
        });

    /**
     * Limit the length of the symbol the user can specify, according to
     * the span of the gate-to-be.
     */
    $('#symbol')
        .on('input', function () {
            $(this).removeClass('errored').removeAttr('title');
            $('#create-gate').prop('disabled', false);

            // up to 3 characters for every qubit used by this gate
            if (($(this).val() as string).length > circuit.qubits.length * 3) {
                $(this)
                .addClass('errored')
                .attr('title', `Be concise (max. ${circuit.qubits.length * 3} characters)`);
                
                $('#create-gate').prop('disabled', true);
            }
        });

    /**
     * On clicking the close button, hide the gatebuilder.
     */
    $('#close-gatebuilder')
        .on('click', () => {
            const aura = $('#gatebuilder-aura'), DURATION = 200; // milliseconds

            if (aura.css('display') === 'none') return;

            $('#desc, #symbol, #title').val('');
            $('gatebuilder').css('animation', `modal-disappear ${DURATION * 0.001}s ease`);
            setTimeout(() => { aura.css('display', 'none'); }, DURATION * 0.9);
        });
    
    /**
     * On clicking the gatebuilder `create` button, spawn a new HTMLElement `gate` on the toolbox,
     * that represents the current circuit as a draggable `Gate`.
     */
    $('#create-gate')
        .on('click', () => {
            createdGates++;

            const desc = $('#desc').val();
            const title = ($('#title').val() as string).trim()  || `Custom Gate #${createdGates}`; 
            const symbol = ($('#symbol').val() as string).trim();
            const def = new Template(circuit, {
                minQubits: false, states: false,
                aliases: false, colors: false, stacks: false
            });

            $('#custom-gates-panel').append(
                $('#template-custom').clone()
                .attr({
                    id: `cg${createdGates}`,
                    definition: def.json(), // save the whole current circuit instance as def
                    span: circuit.qubits.length, // it follows that it spans as many qubits as there are currently
                })
                .text(symbol || `CG${createdGates}`) // if not given a symbol, fall back to default convention
                .css('display', 'inline-flex')
                .append($('<description></description>') // add given or default title and desc only if specified
                    .html(
                        `<b>${title}</b>
                        <br><br>${desc ? `${desc}<br><br>` : ''}
                        CTRL + Click to reconstruct its circuit definition.
                        <br><br>SHIFT + Click to delete.`))
                .on('mousedown', function (e) { copy(this, e, circuit); }) // arm it with drag-and-drop behavior
                .on('mouseenter', function () { showTooltip(tooltipsAllowed, this, 'left', 0, +10); }) // spawn tooltip on hover
                .on('mouseleave', () => { if (tooltipsAllowed) $('tooltip').remove(); })
                .on('click', function (e) { // on SHIFT + Click, remove this custom gate from the toolbox
                    if (e.button !== 0 || !e.shiftKey || e.ctrlKey || e.altKey) return;

                    // simply hide it from the DOM, as it might be used in previous templates
                    // TODO: this is probably not an amazing solution
                    $(this).trigger('mouseleave').css('display', 'none');
                })
                .on('click', function(e) { // on CTRL + Click, rebuild its circuit definition in a new tab
                    if (e.button !== 0 || e.shiftKey || !e.ctrlKey || e.altKey) return;

                    new Tab(tabs, circuit, def).title = title;
                    // wipe carry-over stacks, this is supposed to be the initial state
                    circuit.undoStack = [];
                    circuit.redoStack = [];
                    circuit.toggleButtons();
                }));
        
            $('#close-gatebuilder').trigger('click');
        });

    /**
     * For every specified output option, reveal the corresponding output
     * panel on click, and hide it instead if already summoned.
     */
    for (const output of ['counts', 'amplitudes'])
        $(`#${output}`).on('click', function () {
            // hide previously spawned panels that are not itself
            $('output-panel').not(`#${output}-panel`).removeClass('slide-in');
            // change active status from previous actions
            $('.output-option').removeClass('active');

            const panel = $(`#${output}-panel`), current = new Template(circuit);

            if (panel.hasClass('slide-in')) {
                // hide the panel
                panel.removeClass('slide-in').addClass('slide-out');
                return;
            }
            if (last[output]?.equals(current)) {
                // if instance hasnt changed since last time, dont recalculate
                panel.removeClass('slide-out').addClass('slide-in');
                $(this).addClass('active');
                
                return;
            }
            // save new instance flag
            last[output] = current;
            $(document.body).css('cursor', 'wait');

            // send circuit instance to backend and plot results
            $.ajax({
                url: `${SERVER_IP}/parser`,
                method: 'POST',
                contentType: 'application/json',
                data: payload(output, circuit),
                success: (response: any) => {
                    plot(output, response)
                
                    setTimeout(() => {
                        // summon the output panel
                        panel.removeClass('slide-out').addClass('slide-in');
                        $(this).addClass('active');
                    }, 100); },
                error: (xhr, status, error) => {
                    alert('An unexpected error has occurred. Try again later.'); },
                complete: () => { 
                    $(document.body).css('cursor', 'default'); }
            });
        });

    /**
     * On clicking outside of a summoned output panel, make it disappear again.
     */
    $(document.body).on('mousedown', (e) => {
        // check all panels at once, this is redundant as at most one can be visible at a time
        // but its also simpler and protects from random errors
        const panels = $('output-panel');
        const options = $('.output-option');

        // clicking on options is technically clicking outside of a panel, but ignore them
        // as they act on sliding panels themselves (with precedence, as well)
        if (options.is(e.target) || options.has(e.target).length) return;
        if (panels.is(e.target) || panels.has(e.target).length) return;

        panels.removeClass('slide-in');
        options.removeClass('active');
    });
    
    /**
     * On clicking any "copy to clipboard" button, copy the contents of the span
     * of the parent element to the user's clipboard and summon a short-lived
     * confirmation popup.
     */
    $('.clipboard').on('click', function () {
        const text = $(this.parentElement!).find('span').text();

        if (!text) return;

        navigator.clipboard.writeText(text)
        .then(() => {
            const rect = this.getBoundingClientRect();
            const tooltip = $('<copy-confirm></copy-confirm>')
                .css({
                    top: this.clientTop + rect.height / 3,
                    right: this.clientLeft + rect.width * 1.5
                })
                .text('Copied!');

            $(this.parentElement!).append(tooltip);
            setTimeout(() => { tooltip.remove(); }, 900);
        })
        .catch(err => {
            alert('Could not copy to clipboard.');
        });
    });

    // pending implementation
    for (const output of ['unitary', 'phases', 'code'])
        $(`#${output}`)
            .prop('disabled', true)
            .attr('title', 'Not supported yet!');

    // pending implementation
    $('#export')
        .on('click', () => {
            // TODO: after implementing source code generation
        });

    // pending implementation
    $('#import')
        .on('click', () => {
            // TODO: after implementing source code generation
        });

    /**
     * Translate global keyboard shortcuts into actions.
     */
    $(document)
    .on('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'tab': 
                return; // TODO: HANDLE TAB PRESS
            case 'escape': 
                return $('#close-gatebuilder').trigger('click');
            case 'z':
                if (e.ctrlKey && e.shiftKey) return circuit.load('next'); // CTRL + SHIFT + Z: redo
                else if (e.ctrlKey)          return circuit.load('previous'); // CTRL + Z: undo
            case 'y': 
                if (e.ctrlKey) return circuit.load('next'); // CTRL + Y: redo
            case 's': 
                if (e.ctrlKey && e.shiftKey) return; // TODO: handle import
                else if (e.ctrlKey)          return; // TODO: handle export
            case 'q':
                if (e.ctrlKey) return $('#include-tab').trigger('click'); // CTRL + Q: add new tab
            case 'c': 
                if (e.ctrlKey) { // CTRL + C: clear
                    e.preventDefault();
                    $('#clear').trigger('click');
                }
                return;
            case 'a': 
                if (e.ctrlKey && !$('.add-custom').prop('disabled')) { // CTRL + A: open gate builder
                    e.preventDefault();
                    $('.add-custom').trigger('click');
                }
                return;
        }
    });
});