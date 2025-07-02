// Copyright 2025 Jelly Terra <jellyterra@proton.me>
// Use of this source code form is governed under the MIT license.

import { readFileSync } from 'fs';
import * as vscode from 'vscode';
import * as JSONC from 'jsonc-parser';

export function activate(context: vscode.ExtensionContext) {
	const getConf = () => vscode.workspace.getConfiguration("copyright");
	const evalTemplate = () => evalFile(`${vscode.workspace.workspaceFolders?.[0].uri.path}/${getConf().get<string>("projectScriptPath")}`);
	const getIgnoreList = () => JSON.parse(getConf().get<string>("ignoreList")!!);

	context.subscriptions.push(vscode.commands.registerCommand('copyright-updater.updateEditor', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		if (isIgnored(getIgnoreList(), editor.document.uri)) {
			vscode.window.showInformationMessage('Ignored path. Nothing to do.');
			return;
		}

		vscode.workspace.applyEdit(updateCopyright(editor.document, <string>evalTemplate()));

		vscode.window.showInformationMessage('Copyright has been updated for the active editor.');
	}));

	context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
		if (!getConf().get<boolean>("updateOnSave") || isIgnored(getIgnoreList(), event.document.uri)) {
			return;
		}

		const edit = updateCopyright(event.document, evalTemplate());
		if (edit.size === 0) {
			return;
		}
		vscode.workspace.applyEdit(edit);

		vscode.window.showInformationMessage('Copyright has been updated for saved file.');
	}));
}

export function deactivate() {
	vscode.window.showInformationMessage("Copyright updater has been deactivated.");
}

function evalFile(path: string) {
	return eval(readFileSync(path).toString());
}

function getRelativePath(uri: vscode.Uri) {
	return uri.fsPath.slice(vscode.workspace.workspaceFolders?.[0].uri.fsPath.length!! + 1); // +1 for "/" at the ending
}

function isIgnored(ignoreList: string[], uri: vscode.Uri): boolean {
	for (const rule of ignoreList) {
		if (getRelativePath(uri).match(rule)?.length === 1) {
			return true;
		}
	}
	return false;
}

function getLanguageConfiguration(languageId: string) {
	const found = vscode.extensions.all
		.map(ext => [ext, ext.packageJSON?.contributes?.languages?.filter((lang: any) => lang.id === languageId)])
		.filter(i => i)
		.filter(([_, langs]) => langs && langs.length > 0)
		.map(([ext, langs]) => [ext, langs[0]]);

	if (found.length === 0) {
		throw Error(`Missing extension or language configuration: ${languageId}`);
	}

	const [ext, lang] = found[0];

	return JSONC.parse(readFileSync(`${ext.extensionPath}/${lang.configuration}`).toString());
}

function updateCopyright(document: vscode.TextDocument, text: string): vscode.WorkspaceEdit {
	const langConf = getLanguageConfiguration(document.languageId);

	const edit = new vscode.WorkspaceEdit();

	const prefix = langConf.comments.lineComment;

	if (!prefix) {
		return edit;
	}

	document.getText();

	let lineStart = 0;
	while (lineStart < document.lineCount && document.getText(document.lineAt(lineStart).range) === "") {
		lineStart++;
	}
	const start = new vscode.Position(lineStart, 0);

	let lineEnd = lineStart;
	while (lineStart < document.lineCount && document.getText(document.lineAt(lineEnd).range).startsWith(prefix)) {
		lineEnd++;
	}
	const end = new vscode.Position(lineEnd, 0);

	let con = "";
	for (const line of text.split("\n").slice(1, -1)) {
		con += line.length === 0 ? `${prefix}\n` : `${prefix} ${line}\n`;
	}
	if (lineStart === lineEnd) {
		con += "\n";
	}

	const range = new vscode.Range(start, end);

	if (document.getText(range) !== con) {
		edit.delete(document.uri, range);
		edit.insert(document.uri, start, con);
	}

	return edit;
}
