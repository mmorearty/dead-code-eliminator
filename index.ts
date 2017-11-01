import * as ts from "typescript";
import * as fs from "fs";

const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({}),
    getScriptFileNames: () => ["example.ts"],
    getScriptVersion: (filename: string) => "hi mom",
    getScriptSnapshot: (filename: string): ts.IScriptSnapshot => {
        const text = fs.readFileSync(filename, "utf8");
        return {
            getText: (start: number, end: number) => text.slice(start, end),
            getLength: () => text.length,
            getChangeRange: (oldSnapshot: ts.IScriptSnapshot) => undefined
        };
    },
    getCurrentDirectory: process.cwd,
    getDefaultLibFileName: (options: ts.CompilerOptions) => "node_modules/typescript/lib/lib.d.ts",
    getNewLine: () => "\n"
};
const languageService = ts.createLanguageService(host);
const exampleSource = fs.readFileSync("example.ts", "utf8");
const sourceFile = ts.createSourceFile("example.ts", exampleSource, ts.ScriptTarget.ES2015);

function getText(node: ts.Node) {
    return sourceFile.text.substring(node.getStart(sourceFile), node.getEnd());
}

let updated: ts.Node;
function visit(parent: ts.Node, node: ts.Node, ind: string) {
    console.log(ind + ts.SyntaxKind[node.kind] + "\n>>>getFullText:" + node.getFullText(sourceFile).replace(/\n/g, "\\n") + "\ngetText:" + getText(node).replace(/\n/g, "\\n"));
    if (ts.isIfStatement(node)) {
        console.log(ind + ">>>childCount:" + node.getChildCount(sourceFile));
        const conditional = node.expression;
        console.log(ind + ">>>conditional:" + ts.SyntaxKind[conditional.kind]);
        if (conditional.kind == ts.SyntaxKind.FalseKeyword) {
            console.log(ind + "parent: " + ts.SyntaxKind[parent.kind]);
            if (ts.isBlock(parent)) {
                console.log(parent.statements.length);
                updated = ts.updateBlock(parent, parent.statements.slice(1));
            }
        }
    }
    ts.forEachChild(node, (child: ts.Node) => {
        visit(node, child, ind + "  ");
    });
}

visit(null, sourceFile, "");
visit(null, updated, "");
visit(null, sourceFile, "");

const resultFile = ts.createSourceFile("someFileName.ts", "", ts.ScriptTarget.Latest, /*setParentNodes*/ false, ts.ScriptKind.TS);
const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false
});
const result = printer.printNode(ts.EmitHint.Unspecified, updated, resultFile);

console.log(result);

const mathTransformer = <T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
    function visit(node: ts.Node): ts.Node {
        node = ts.visitEachChild(node, visit, context);
        if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const binary = node as ts.BinaryExpression;
            if (binary.left.kind === ts.SyntaxKind.NumericLiteral
            && binary.right.kind === ts.SyntaxKind.NumericLiteral) {
                const left = binary.left as ts.NumericLiteral;
                const leftVal = parseFloat(left.text);
                const right = binary.right as ts.NumericLiteral;
                const rightVal = parseFloat(right.text);
                switch (binary.operatorToken.kind) {
                    case ts.SyntaxKind.PlusToken:
                        return ts.createLiteral(leftVal + rightVal);
                    case ts.SyntaxKind.AsteriskToken:
                        return ts.createLiteral(leftVal * rightVal);
                    case ts.SyntaxKind.MinusToken:
                        return ts.createLiteral(leftVal - rightVal);
                }
            }
        }
        return node;
    }
    return ts.visitNode(rootNode, visit);
};

// console.log("----------------");
// const commentFinder = ts.createScanner(ts.ScriptTarget.ES2015, /*skipTrivia=*/false);
// commentFinder.setText(`
//     // first leading one-line comment
//     // second leading one-line comment
//     console.log(/* inline comment */ 'hello')
//     // trailing comment
// `);
// let kind: ts.SyntaxKind;
// while ((kind = commentFinder.scan()) != ts.SyntaxKind.EndOfFileToken) {
//     console.log("kind:", ts.SyntaxKind[kind], "getTokenText:", commentFinder.getTokenText());
// }
// console.log("----------------");
// commentFinder.setText(`
//     // first leading one-line comment
//     // second leading one-line comment
//     console.log(/* inline comment */ 'hello')
//     // trailing comment
// `);
// while ((kind = commentFinder.scan()) != ts.SyntaxKind.EndOfFileToken) {
// console.log("kind:", ts.SyntaxKind[kind], "getTokenText:", commentFinder.getTokenText());
// }
// console.log("----------------");

const deadCodeTransformer = <T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
    function visit(node: ts.Node, ind: string): ts.Node {
        node = ts.visitEachChild(node, (node: ts.Node) => visit(node, ind + "  "), context);
        console.log(ind + ts.SyntaxKind[node.kind] + ":" + node.getFullText(sourceFile).replace(/\n/g, "\\n"));
        if (ts.isIfStatement(node)) {
            const children = node.getChildren(sourceFile);
            children.forEach(child => console.log(child));
        }
        if (ts.isBlock(node)) {
            const statements = node.statements.map(statement => {
                if (!ts.isIfStatement(statement)) {
                    return statement;
                }
                if (statement.expression.kind == ts.SyntaxKind.FalseKeyword) {
                    if (ts.isBlock(statement.elseStatement) && statement.elseStatement.statements.length === 1) {
                        return statement.elseStatement.statements[0];
                    } else {
                        return statement.elseStatement; // might be null; filtered below
                    }
                }
                return statement;
            }).filter(statement => !!statement);
            return ts.updateBlock(node, statements);
        }

        if (ts.isConditionalExpression(node)) { // ternary
            if (node.condition.kind === ts.SyntaxKind.FalseKeyword) {
                return node.whenFalse;
            }
            if (ts.isPrefixUnaryExpression(node.condition) &&
                node.condition.operator === ts.SyntaxKind.ExclamationToken &&
                node.condition.operand.kind === ts.SyntaxKind.FalseKeyword) {
                return node.whenTrue;
            }
        }
        return node;
    }
    return ts.visitNode(rootNode, (node: ts.Node) => visit(node, ""));
};

const trResult: ts.TransformationResult<ts.SourceFile> = ts.transform<ts.SourceFile>(
    sourceFile, [ mathTransformer, deadCodeTransformer ]
  );

const transformedSourceFile: ts.SourceFile = trResult.transformed[0];

console.log("------------- printer.printFile(sourceFile)")
console.log(printer.printFile(sourceFile));
console.log("------------- printer.printFile(transformedSourceFile)");
console.log(printer.printFile(transformedSourceFile));
// xcxc comments are lost

trResult.dispose();

let printed = "";
function visitForPrinting(parent: ts.Node, node: ts.Node) {
    printed += getText(node);
    ts.forEachChild(node, (child: ts.Node) => {
        visitForPrinting(node, child);
    });
}

visitForPrinting(null, transformedSourceFile);
console.log("-------------");
console.log(printed);