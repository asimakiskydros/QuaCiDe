# QuaCiDe
QuaCiDe (pronounced *cassidy*) is an intuitive, user-friendly quantum circuit designer made in HTML/JS/CSS/Python.
Its simplistic design but powerful foundation aims to enable learning in the field of Quantum Computing and ease
research and experimentation by liberating the user from technical demands, such as program installations, coding,
scaling restrictions etc.

## (Alpha-phase) Installation
The present product is still in Alpha development phase, therefore to access it you'll have to run its
files in a controlled IDE environment that offers and/or supports servers for HTML execution.
[Visual Studio Code](https://code.visualstudio.com/) running Live Server is recommended. Both
[`base.html`](https://github.com/asimakiskydros/QuaCiDe/blob/main/base.html) and [`parser_script.py`](https://github.com/asimakiskydros/QuaCiDe/blob/main/parser_script.py)
need to be running for the designer to be fully functional. Make sure Python 3 and all listed languages are supported by your system.

## Usage
The UI offers a variety of user-friendly actions:
* Drag-and-drop gates from the toolbox to the qubit wires to build your circuit.
* New qubit wires are automatically created when dragging and discarded when unused.
* Add and delete new qubits at will through the `+` and `x` buttons, shown on hover.
* Clear the circuit through the `Clear` button or by pressing `CTRL + c`.
* `Left-click + hold` on placed gates to move them around, `Right-click` them to delete them instantly.
* `SHIFT + Left-click` on placed gates to spawn a copy next to them.
* `CTRL + Left-click` on placed gates to spawn a copy below them.
* Spawn new steps by shoving dragged gates in-between existing steps.
* Empty steps are deleted automatically.
* Add desired exponents to input-armed gates.
* Apply postselection to desired qubits by `ALT + click`ing on measurement gates. 
* `Left-click` on the qubit states to shuffle among the standard starting states.
* `CTRL + Left-click` on the qubit states to shuffle between register colors. Neighboring register borders
  become unified into one.
* Perform the previous two actions while pressing `SHIFT` to revert to default state.
* See circuit-relevant stats, like `#qubits`, `#gates`, `#steps`, on the live counters.
* Toggle the endianness of the circuit register from the `⮝` button on the toolbar.
* Have multiple circuits at once by declaring multiple tabs.
* Turn circuits into custom gates by pressing the toolbox cross button or `CTRL + a`.
* Export the current circuit layout as JSONLines by pressing the `Export` button or `CTRL + s`.
* Import new circuit layout from valid JSONLines through the `Import` button or by pressing `CTRL + SHIFT + s`.
* Undo/Redo actions through the relevant buttons or by pressing `CTRL + z` and `CTRL + SHIFT + z`/`CTRL + y` respectively.
* Press `Run Circuit` or `CTRL + x` to summon the execution modal.
* Exit the modal by clicking outside of it or by pressing `Esc`.
* Set desired conditions for experiment and run your circuit on Qiskit through `Execute Simulation`.

# Outputs
* The user-defined circuit is translated into a Qiskit object under the hood and away from the user's system.
* Qiskit-Aer's backends are used to run the parsed circuit, defaulting to QASM.
* Outputs are returned to the user as completely interactable and readily downloadable plots.

## About
* This project acts as my Bachelor's thesis. 
* This project is not yet meant for F/OSS distribution and usage. Soon!
