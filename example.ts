/**
 * jsdoc hello.
 */
function foo() {
    /* hello */
    if (false) {
        // comment -1
        console.log("unreachable");
    } else {
        // comment 0
        console.log("reachable");
    }
    // comment 2
    const x = false ? 1 : 2;
    // comment 3
    const y = !false ? 1 : 2;
    // comment 4
    console.log("after");
    console.log(1+1);
}
