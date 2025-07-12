// Copyright 2025 Jelly Terra <jellyterra@proton.me>
// Use of this source code form is governed under the MIT license.

import { existsSync, readdirSync, readFileSync } from 'fs';
import * as vscode from 'vscode';
import * as JSONC from 'jsonc-parser';

class Scope {
	pattern = "";
	template = "";
}

class Config {
	scopes: Scope[] = [];

	ignoreListFiles: string[] = [];
}

function isMatched(regexList: string[], s: string): boolean {
	for (const rule of regexList) {
		if (s.match(rule)?.length === 1) {
			return true;
		}
	}
	return false;
}

function getExtensionConfig() {
	return vscode.workspace.getConfiguration("copyright");
}

function getWorkspaceRoot() {
	return vscode.workspace.workspaceFolders![0].uri.path;
}

function getRelativePath(uri: string) {
	return uri.slice(getWorkspaceRoot().length + 1); // +1 for "/" at the ending
}

function getProjectConfig() {
	const path = `${getWorkspaceRoot()}/.vscode/copyright.json`;
	return existsSync(path) ? <Config>JSONC.parse(readFileSync(path).toString()) : null;
}

function getIgnoreListFromFile(path: string): string[] {
	const ignoreList: string[] = [];

	for (const line of readFileSync(path).toString().split("\n")) {
		if (line.length === 0 || line.startsWith("#")) {
			continue;
		}
		const regex = "^" + line;

		try {
			"".match(regex);
			ignoreList.push(regex);
		} catch {
			// Ignore.
		}
	}

	return ignoreList;
}

function getIgnoreList(): string[] {
	const ignoreList = JSON.parse(getExtensionConfig().get<string>("ignoreList")!);

	const ignoreListFiles = getProjectConfig()?.ignoreListFiles;
	if (ignoreListFiles) {
		for (const path of ignoreListFiles) {
			ignoreList.push(...getIgnoreListFromFile(`${getWorkspaceRoot()}/${path}`));
		}
	}

	return ignoreList;
}

function getLanguageConfiguration(languageId: string) {
	const found = vscode.extensions.all
		.map(ext => [ext, ext.packageJSON?.contributes?.languages?.filter((lang: any) => lang.id === languageId)])
		.filter(i => i)
		.filter(([_, langs]) => langs && langs.length > 0)
		.map(([ext, langs]) => [ext, langs[0]]);

	if (found.length === 0) {
		return null;
	}

	const [ext, lang] = found[0];

	return JSONC.parse(readFileSync(`${ext.extensionPath}/${lang.configuration}`).toString());
}

function evalFile(path: string) {
	return eval(readFileSync(path).toString());
}

function evalTemplate(uri: vscode.Uri) {
	const config = getProjectConfig();
	if (!config) {
		return evalFile(`${getWorkspaceRoot()}/.vscode/copyright.js`);
	}

	const relativePath = getRelativePath(uri.path);
	for (const scope of config.scopes) {
		if (relativePath.match(scope.pattern)) {
			return evalFile(`${getWorkspaceRoot()}/${scope.template}`);
		}
	}

	// Does not belong to any scope.
	return null;
}

function updateCopyright(document: vscode.TextDocument, text: string): vscode.WorkspaceEdit | null {
	const langConf = getLanguageConfiguration(document.languageId);
	if (!langConf) {
		return null;
	}

	const prefix = langConf.comments.lineComment;
	if (!prefix) {
		return null;
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

	if (document.getText(range) === con) {
		return null;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.delete(document.uri, range);
	edit.insert(document.uri, start, con);

	return edit;
}

function walkFiles(dir: string, patterns: string[] = []): string[] {
	const ignoreList = getIgnoreList();

	const files: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = `${entry.parentPath}/${entry.name}`;
		const relativePath = getRelativePath(path);

		if (isMatched(ignoreList, relativePath)) {
			continue;
		}

		if (entry.isFile() && isMatched(patterns, relativePath)) {
			files.push(path);
		}

		if (entry.isDirectory()) {
			files.push(...walkFiles(path, patterns));
		}
	}

	return files;
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('copyright-updater.updateEditor', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const uri = editor.document.uri;

		if (isMatched(getIgnoreList(), getRelativePath(uri.path))) {
			vscode.window.showInformationMessage('Ignored path. Nothing to do.');
			return;
		}

		const text = evalTemplate(uri);
		if (!text) {
			vscode.window.showInformationMessage("Path of file in the active editor does not belong to any scope. Nothing to do.");
			return;
		}

		const edit = updateCopyright(editor.document, text);
		if (!edit) {
			return;
		}
		vscode.workspace.applyEdit(edit);

		vscode.window.showInformationMessage('Copyright has been updated for the active editor.');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('copyright-updater.updateProjectFiles', () => {
		const config = getProjectConfig();
		if (!config) {
			vscode.window.showErrorMessage("Missing project configuration file for file scope.");
			return;
		}

		for (const path of walkFiles(getWorkspaceRoot(), config.scopes.map(it => it.pattern))) {
			vscode.workspace.openTextDocument(vscode.Uri.parse("file://" + path)).then(document => {
				const relativePath = getRelativePath(path);

				const edit = updateCopyright(document, evalFile(`${getWorkspaceRoot()}/${config.scopes.find(scope => relativePath.match(scope.pattern))!.template}`));
				if (!edit) {
					return;
				}
				vscode.workspace.applyEdit(edit);

				vscode.window.showInformationMessage(`Copyright has been updated: ${relativePath}`);
			});
		}

		vscode.window.showInformationMessage(`Updated copyright for all project files.`);
	}));

	context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
		const uri = event.document.uri;
		if (!getExtensionConfig().get<boolean>("updateOnSave") || isMatched(getIgnoreList(), getRelativePath(uri.path))) {
			return;
		}

		const template = evalTemplate(uri);
		if (!template) {
			return;
		}

		const edit = updateCopyright(event.document, template);
		if (!edit) {
			return;
		}
		vscode.workspace.applyEdit(edit);

		vscode.window.showInformationMessage('Copyright has been updated for saved file.');
	}));

	const settingsUri = vscode.Uri.parse(`file://${getWorkspaceRoot()}/.vscode/copyright.json`);

	if (existsSync(`${getWorkspaceRoot()}/.vscode/copyright.json`)) {
		if (getExtensionConfig().get<boolean>("updateOnSave")) {
			vscode.window.showInformationMessage("Copyright settings detected.", "View", "Ignore").then(ans => {
				if (ans === "View") {
					vscode.workspace.openTextDocument(settingsUri).then(document => vscode.window.showTextDocument(document));
				}
			});
		} else {
			const ask = () => vscode.window.showInformationMessage("Copyright settings detected. Update on save?", "Enable", "View", "Ignore").then(ans => {
				switch (ans) {
					case "Enable":
						getExtensionConfig().update("updateOnSave", true);
					case "View":
						vscode.workspace.openTextDocument(settingsUri).then(document => vscode.window.showTextDocument(document));
						ask();
				}
			});
			ask();
		}
	} else if (existsSync(`${getWorkspaceRoot()}/.vscode/copyright.js`)) {
		vscode.window.showInformationMessage("Simple copyright template detected. Please trigger copyright update by the command manually.", "View", "Ignore").then(ans => {
			if (ans === "View") {
				vscode.workspace.openTextDocument(vscode.Uri.parse(`${getWorkspaceRoot()}/.vscode/copyright.js`)).then(document => vscode.window.showTextDocument(document));
			}
		});
	} else {
		vscode.window.showInformationMessage("No copyright settings detected. Create one?", "Yes", "No").then(ans => {
			if (ans === "Yes") {
				vscode.workspace.fs.writeFile(settingsUri, new TextEncoder().encode(JSON.stringify({
					scopes: [{
						pattern: "^",
						template: ".vscode/",
					}]
				})));
				setTimeout(() => vscode.workspace.openTextDocument(settingsUri).then(document => vscode.window.showTextDocument(document)), 500);
			}
		});
	}
}

export function deactivate() {
	vscode.window.showInformationMessage("Copyright updater has been deactivated.");
}
