from qiskit import QuantumCircuit, transpile
from qiskit_aer import Aer
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
    counts, amplitudes, probabilites, unitary, unitary_squares = None, None, None, None, None    
    template = request.get_json()

    gate_matrix_measured = get_gate_matrix(template)
    gate_matrix_unmeasured = get_gate_matrix(template, ignore = 'measurementGate')
    initial_state = get_initial_state(template)

    if template.get('includeCounts'):
        counts = calculate_counts(template, gate_matrix_measured, initial_state)
    if template.get('includeAmps'):
        amplitudes, probabilites = calculate_amplitudes(template, gate_matrix_unmeasured, initial_state)
    if template.get('includeUnitary'):
        unitary, unitary_squares = calculate_unitary(template, gate_matrix_unmeasured)
    
    return jsonify({
        'counts': counts,
        'amplitudes': amplitudes,
        'probabilites': probabilites,
        'unitary': unitary,
        'unitary_squares': unitary_squares
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


def build_circuit(n_qubits: int, gate_matrix: np.ndarray, initial_state: str = None):
    """ Translates the gate matrix into a Quantum Circuit by turning
        each column into a gate and appending it to the circuit.
    """
    qc = QuantumCircuit(n_qubits, n_qubits)
    if initial_state is not None:
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


def execute(circuit: QuantumCircuit, backend, shots: int = None):
    """ Transpiles the given circuit with the given backend
        and then runs the experiment.
    """
    tqc = transpile(circuit, backend)
    return backend.run(tqc, shots = shots)


def calculate_counts(template: dict, gate_matrix: np.ndarray, initial_state: str) -> dict:
    """ Runs the given circuit on the specified backend, 'shots' times.
        Returns the dictionary of resulting counts.
    """
    circuit = build_circuit(
        template.get('length'),
        gate_matrix,
        initial_state
    )
    try:
        job = execute(
            circuit,
            Aer.get_backend(template.get('backend')),
            shots = template.get('shots')
        )
        return job.result().get_counts()        
    except Exception as e:
        print(f'Exception raised at calculate_counts:\n {e}')
        # if the given circuit contains no measurement gates
        # or the given backend is faulty, there will be no counts
        return None


def calculate_amplitudes(template: dict, gate_matrix: np.ndarray, initial_state: str):
    """ Runs the given circuit on Statevector sim to extrapolate
        theoretical amplitudes and probabilites.
    """
    circuit = build_circuit(
        template.get('length'),
        gate_matrix,
        initial_state
    )
    try:
        job = execute(
            circuit,
            Aer.get_backend('statevector_simulator'),
        )
        amplitudes = job.result().get_statevector(circuit, 4).data
        probabilities = np.round(np.abs(amplitudes) ** 2, 4).tolist()
        # remove unnecessary parentheses
        amplitudes = [el.replace('(', '').replace(')', '') for el in amplitudes.astype(str).tolist()]

        return amplitudes, probabilities    
    except Exception as e:
        print(f'Exception raised at calculate_amplitudes:\n {e}')
        return None, None


def calculate_unitary(template: dict, gate_matrix: np.ndarray):
    """ Runs the given circuit on Unitary sim without initializing
        to extrapolate its entire unitary matrix.
    """
    circuit = build_circuit(
        template.get('length'),
        gate_matrix
    )
    try:
        job = execute(
            circuit, 
            Aer.get_backend('unitary_simulator')
        )
        unitary = job.result().get_unitary().data
        squares = np.round(np.abs(unitary) ** 2, 4).tolist()
        # remove unnecessary parentheses
        unitary = np.round(unitary, 4).astype(str).tolist()
        for row in unitary:
            for i, el in enumerate(row):
                row[i] = el.replace('(', '').replace(')', '')
        
        return unitary, squares
    except Exception as e:
        print(f'Exception raised at calculate_unitary:\n {e}')
        return None, None
    

if __name__ == '__main__':
    app.run()