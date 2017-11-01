import * as ts from "typescript";
import * as fs from "fs";

// boilerplate
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

// read example.ts, make a SourceFile out of it
const exampleSource = fs.readFileSync("example.ts", "utf8");
const sourceFile = ts.createSourceFile("example.ts", exampleSource, ts.ScriptTarget.ES2015);

// node.getText() has a bug, this is a workaround. https://github.com/Microsoft/TypeScript/issues/19670
function getText(node: ts.Node) {
    return sourceFile.text.substring(node.getStart(sourceFile), node.getEnd());
}

const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false
});

function truncString(s: string) {
	if (s.length > 100) {
		return s.substring(0, 100) + "...";
	} else {
		return s;
	}
}

console.log("------------- nodes, including trivia:")

const deadCodeTransformer = <T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
    function visit(node: ts.Node, ind: string): ts.Node {
        node = ts.visitEachChild(node, (node: ts.Node) => visit(node, ind + "  "), context);
        console.log(ind + ts.SyntaxKind[node.kind] + ":" + truncString(node.getFullText(sourceFile).replace(/\n/g, "\\n")));
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
    sourceFile, [ deadCodeTransformer ]
  );

const transformedSourceFile: ts.SourceFile = trResult.transformed[0];

console.log("------------- printer.printFile(sourceFile)")
console.log(printer.printFile(sourceFile));
console.log("------------- printer.printFile(transformedSourceFile)");
console.log(printer.printFile(transformedSourceFile));
// xcxc some comments are lost

trResult.dispose();
