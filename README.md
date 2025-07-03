# Copyright Updater for VSCode

## Behavior

- Check if is in ignore list.
- Evaluate the template.
- Read the line comment prefix string from properties of the language's configuration.
  - Abort if undefined.
- Compare evaluated string with the first line comment block before the source of file.
  - If different, overwrite.
  - If the comment block does not exist, insert.
  - If same, do nothing.

## Project configuration

### Unified template

The extension will evaluate text from `.vscode/copyright.js` script.

### Scope-divided template

The extension will follow the properties defined in `.vscode/copyright.json` configuration.

#### Example:

```json
{
  "ignoreListFiles": [".gitignore"],
  "scopes": [
    {
        "pattern": "^src/.*.scala",
        "template": ".vscode/copyright-scala.js"
    },
    {
        "pattern": "^src/.*.java",
        "template": ".vscode/copyright-java.js"
    }
  ]
}
```

And save the template to the corresponding location.

## Template

Template is a JavaScript snippet.
It will be evaluated and expected to be of type string.

The first and last lines will be dropped.

Example:

```javascript
`
Copyright ${ new Date(Date.now()).getUTCFullYear() } Jelly Terra <jellyterra@proton.me>
Use of this source code form is governed under the MIT license.
`;
```

## Commands

### Update for the active editor

ID: `copyright-updater.updateEditor`

It triggers an update for document in the active editor.

### Update for all project files

ID: `copyright-updater.updateProjectFiles`

It triggers an update for all file scopes defined in the project configuration.

## Configuration

### Update on save

Notification only appears when the file have been actually edited for the copyright update.

### Ignore list

An array of regular expressions in JSON.
File with matched relative path will be ignored by the copyright updater.

# License

**Copyright 2025 Jelly Terra <jellyterra@proton.me>**

Use of this source code form is governed under the MIT license.
