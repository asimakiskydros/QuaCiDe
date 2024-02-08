# QuaCiDe
QuaCiDe (pronounced *cassidy*) is an intuitive, user-friendly quantum circuit designer made in HTML/JS/CSS/Python.

## Installation
The present product is still in development phase, therefore to access it you'll have to run its
files in a controlled IDE environment that offers and/or supports servers for HTML execution.
[Visual Studio Code](https://code.visualstudio.com/) running Live Server is recommended. Both
[`base.html`](https://github.com/asimakiskydros/QuaCiDe/blob/main/base.html) and [`parser_script.py`](https://github.com/asimakiskydros/QuaCiDe/blob/main/parser_script.py)
need to be running for the designer to be fully functional. Make sure Python 3 and all listed languages are supported by your system.

## Usage
The UI offers a variety of user-friendly actions:
* Drag-and-drop gates from the toolbox to the qubit wires to build your circuit.
* New qubit wires are automatically created when dragging and discarded when unused.
* `Left-click` on placed gates to move them around, `Right-click` them to delete them instantly.
* Spawn new steps by shoving dragged gates in-between existing steps.
* Empty steps are deleted automatically.
* Add desired exponents to input-armed gates.
* `Left-click` on the qubit states to shuffle among the standard starting states.
* `Right-click` on the qubit states to shuffle between register colors. Neighboring register borders
  become unified into one.
* See circuit-relevant stats, like `#qubits`, `#gates`, `#steps`, on the live counters.
* Export the current circuit layout as JSON by pressing the `Export` button or `CTRL + s`.
* Import new circuit layout from valid JSON through the `Import` button.
* Undo/Redo actions through the relevant buttons or by pressing `CTRL + z` and `CTRL + SHIFT + z` or
  
  `CTRL + y` respectively.
* Press `Run Circuit` summon the execution modal.
* Set desired conditions for experiment and run your circuit on Qiskit through `Execute Simulation`.
* Receive output as interactable and downloadable plots.

## About
* This project acts as my Bachelor's thesis. 
* This project is not yet meant for F/OSS distribution and usage.
