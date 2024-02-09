from qiskit import Aer, QuantumCircuit, execute
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from sympy import sympify
from numpy.core.defchararray import startswith
from lookup.tables import *
import numpy as np

app = Flask(__name__)
CORS(app)


@app.route('/parser', methods=['POST'])
@cross_origin()
def run_simulation():
    template = request.get_json()
    counts = calculate_counts(template)
    amplitudes = calculate_amplitudes(template)
    probabilites = np.round(np.abs(amplitudes) ** 2, 4)
    
    return jsonify({
        'counts': counts,
        # remove any unnecessary parentheses
        'amplitudes': [el.replace('(', '').replace(')', '') for el in amplitudes.astype(str).tolist()],
        'probabilites': probabilites.tolist()
    })


def get_initial_state(template: dict) -> str:
    """ Builds the specified initial state in 
        little endian, qiskit lettering format.
    """
    initial_state = ''

    for qubit in template.values():
        if not isinstance(qubit, dict):
            continue
        initial_state += ket2str.get(qubit.get('state'), '0')

    return initial_state[::-1]


def get_gate_matrix(template: dict, dummy: str = 'identityGate', ignore: str = None) -> np.ndarray:
    """ Compiles all gate lists into a single matrix, respecting given indeces.
        Pads lists into a rectangle by filling short rows with dummy values.
        Potentially replaces ignore instances with dummy values.
    """
    matrix = []
    # compile all gate lists into a single matrix
    for qubit in template.values():
        if isinstance(qubit, dict):
            matrix.append(qubit.get('gates', []))
    
    # pad the matrix with dummy values till it becomes a perfect rectangle
    max_length = max(len(row) for row in matrix)
    for row in matrix:
        while len(row) < max_length:
            row.append(dummy)
    
    matrix = np.array(matrix)

    # replace all ignore instances with dummy values, if specified
    return np.where(matrix == ignore, dummy, matrix) if ignore and matrix.shape[1] > 0 else matrix


def segregate(column: list[str]):
    """ Splits the indeces of the column based on gate type.
    """
    controls, powers, rest = [], [], []

    for gate_type in control_states:
        controls += np.where(column == gate_type)[0].tolist()
    for gate_type in regular_gates:
        rest += np.where(column == gate_type)[0].tolist()
    for gate_type in powered_gates:
        powers += np.where(startswith(column.astype(str), gate_type))[0].tolist()

    swaps = np.where(column == 'swapGate')[0].tolist()
    measurements = np.where(column == 'measurementGate')[0].tolist()
    
    return controls, swaps, measurements, powers, rest


def create_gate(regulars: list, powers: list, swaps: list, column: list):
    """ Molds the given indeces into a single quantum gate. The subgates
        are added serially, first the regulars, then the powers (with their
        appropriate exponent), and then the swaps iff there are exactly 2.
    """
    custom_gate = QuantumCircuit(len(regulars) + len(powers) + len(swaps))

    i = 0
    for pos in regulars:
        custom_gate.append(regular_gates.get(column[pos])(), [i])
        i += 1
    for pos in powers:
        _id, _pwr = column[pos].split('<!@DELIMITER>')
        custom_gate.append(powered_gates.get(_id)().power(float(sympify(_pwr).evalf())), [i])
        i += 1
    if len(swaps) == 2:
        custom_gate.swap(i, i + 1)
    
    return custom_gate.to_gate()


def build_circuit(n_qubits: int, initial_state: str, gate_matrix: np.ndarray):
    """ Translates the gate matrix into a Quantum Circuit by turning
        each column into a gate and appending it to the circuit.
    """
    qc = QuantumCircuit(n_qubits, n_qubits)
    qc.initialize(initial_state)

    for col in gate_matrix.T:
        # merge the entire column into a single gate
        controls, swaps, measurements, powers, rest = segregate(col)
        custom_gate = create_gate(rest, powers, swaps, col)

        # add controls for the entire column
        for pos in controls:
            custom_gate = custom_gate.control(ctrl_state = control_states[col[pos]])

        # add controlled gate to circuit at correct indeces
        qc.append(custom_gate, controls + rest + powers + swaps)

        # add measurements
        for pos in measurements:
            qc.measure(pos, pos)

        # column done, move to the next
        qc.barrier()

    return qc


def calculate_counts(template: dict) -> dict:
    """ Runs the given circuit on the specified backend, 'shots' times.
        Returns the dictionary of resulting counts.
    """
    circuit = build_circuit(
        template.get('length'),
        get_initial_state(template),
        get_gate_matrix(template)
    )
    try:
        job = execute(
            circuit,
            Aer.get_backend(template.get('backend')),
            shots = template.get('shots')
        )
        return job.result().get_counts()        
    except:
        # if the given circuit contains no measurement gates
        # or the given backend is faulty, there will be no counts
        return None


def calculate_amplitudes(template) -> list:
    """ Runs the given circuit on Statevector sim to extrapolate
        theoretical probability amplitudes.
    """
    circuit = build_circuit(
        template.get('length'),
        get_initial_state(template),
        get_gate_matrix(template, ignore = 'measurementGate')
    )
    job = execute(circuit, Aer.get_backend('statevector_simulator'))
    return job.result().get_statevector(circuit, 4).data


if __name__ == '__main__':
    app.run()