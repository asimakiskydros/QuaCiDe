export function alertWrongImport () {
    alert('Import failed; given file of wrong format.');
}
export function alertServerError () {
    alert('Execution failed; there was a problem with the server.');
}
export function alertNoMeasuring () {
    alert('Execution thwarted; you have placed no measurement gates.');
}
export function alertNaNinPoweredGate () {
    alert('Execution thwarted; Not-a-Number detected inside powered gate.');
}
export function alertErrorsOnCircuit () {
    alert('Execution thwarted; your circuit contains errored gates.');
}
export function alertNonUnitary () {
    alert('Creation failed; the given input was not a unitary matrix.');
}
export function alertCreationDisallowed () {
    alert('Creation blocked; your circuit is invalid.');
}