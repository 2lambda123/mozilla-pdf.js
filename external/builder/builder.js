"use strict";

const fs = require("../../src/shared/fs.js"),
  path = require("path"),
  vm = require("vm");

/**
 * A simple preprocessor that is based on the Firefox preprocessor
 * (https://dxr.mozilla.org/mozilla-central/source/build/docs/preprocessor.rst).
 * The main difference is that this supports a subset of the commands and it
 * supports preprocessor commands in HTML-style comments.
 *
 * Currently supported commands:
 * - if
 * - elif
 * - else
 * - endif
 * - include
 * - expand
 * - error
 *
 * Every #if must be closed with an #endif. Nested conditions are supported.
 *
 * Within an #if or #else block, one level of comment tokens is stripped. This
 * allows us to write code that can run even without preprocessing. For example:
 *
 * //#if SOME_RARE_CONDITION
 * // // Decrement by one
 * // --i;
 * //#else
 * // // Increment by one.
 * ++i;
 * //#endif
 */
function preprocess(inFilename, outFilename, defines) {
  let lineNumber = 0;
  function loc() {
    return fs.realpathSync(inFilename) + ":" + lineNumber;
  }

  // TODO make this really read line by line.
  const lines = fs.readFileSync(inFilename).toString().split("\n");
  const totalLines = lines.length;
  let out = "";
  let i = 0;
  function readLine() {
    if (i < totalLines) {
      return lines[i++];
    }
    return null;
  }
  const writeLine =
    typeof outFilename === "function"
      ? outFilename
      : function (line) {
          out += line + "\n";
        };
  function evaluateCondition(code) {
    if (!code || !code.trim()) {
      throw new Error("No JavaScript expression given at " + loc());
    }
    try {
      return vm.runInNewContext(code, defines, { displayErrors: false });
    } catch (e) {
      throw new Error(
        'Could not evaluate "' +
          code +
          '" at ' +
          loc() +
          "\n" +
          e.name +
          ": " +
          e.message
      );
    }
  }
  function include(file) {
    const realPath = fs.realpathSync(inFilename);
    const dir = path.dirname(realPath);
    try {
      let fullpath;
      if (file.indexOf("$ROOT/") === 0) {
        fullpath = path.join(
          __dirname,
          "../..",
          file.substring("$ROOT/".length)
        );
      } else {
        fullpath = path.join(dir, file);
      }
      preprocess(fullpath, writeLine, defines);
    } catch (e) {
      if (e.code === "ENOENT") {
        throw new Error('Failed to include "' + file + '" at ' + loc());
      }
      throw e; // Some other error
    }
  }
  function expand(line) {
    line = line.replace(/__[\w]+__/g, function (variable) {
      variable = variable.substring(2, variable.length - 2);
      if (variable in defines) {
        return defines[variable];
      }
      return "";
    });
    writeLine(line);
  }

  // not inside if or else (process lines)
  const STATE_NONE = 0;
  // inside if, condition false (ignore until #else or #endif)
  const STATE_IF_FALSE = 1;
  // inside else, #if was false, so #else is true (process lines until #endif)
  const STATE_ELSE_TRUE = 2;
  // inside if, condition true (process lines until #else or #endif)
  const STATE_IF_TRUE = 3;
  // inside else or elif, #if/#elif was true, so following #else or #elif is
  // false (ignore lines until #endif)
  const STATE_ELSE_FALSE = 4;

  let line;
  let state = STATE_NONE;
  const stack = [];
  const control =
    /^(?:\/\/|<!--)\s*#(if|elif|else|endif|expand|include|error)\b(?:\s+(.*?)(?:-->)?$)?/;

  while ((line = readLine()) !== null) {
    ++lineNumber;
    const m = control.exec(line);
    if (m) {
      switch (m[1]) {
        case "if":
          stack.push(state);
          state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          break;
        case "elif":
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          } else if (state === STATE_ELSE_TRUE) {
            throw new Error("Found #elif after #else at " + loc());
          } else {
            throw new Error("Found #elif without matching #if at " + loc());
          }
          break;
        case "else":
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = STATE_ELSE_TRUE;
          } else {
            throw new Error("Found #else without matching #if at " + loc());
          }
          break;
        case "endif":
          if (state === STATE_NONE) {
            throw new Error("Found #endif without #if at " + loc());
          }
          state = stack.pop();
          break;
        case "expand":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            expand(m[2]);
          }
          break;
        case "include":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            include(m[2]);
          }
          break;
        case "error":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            throw new Error("Found #error " + m[2] + " at " + loc());
          }
          break;
      }
    } else {
      if (state === STATE_NONE) {
        writeLine(line);
      } else if (
        (state === STATE_IF_TRUE || state === STATE_ELSE_TRUE) &&
        !stack.includes(STATE_IF_FALSE) &&
        !stack.includes(STATE_ELSE_FALSE)
      ) {
        writeLine(line.replace(/^\/\/|^<!--/g, "  ").replace(/-->$/g, ""));
      }
    }
  }
  if (state !== STATE_NONE || stack.length !== 0) {
    throw new Error(
      "Missing #endif in preprocessor for " + fs.realpathSync(inFilename)
    );
  }
  if (typeof outFilename !== "function") {
    fs.writeFileSync(outFilename, out);
  }
}
exports.preprocess = preprocess;

function preprocessCSS(mode, source, destination) {
  function hasPrefixedMozcentral(line) {
    return /(^|\W)-(ms|o|webkit)-\w/.test(line);
  }

  function expandImports(content, baseUrl) {
    return content.replace(
      /^\s*@import\s+url\(([^)]+)\);\s*$/gm,
      function (all, url) {
        const file = path.join(path.dirname(baseUrl), url);
        const imported = fs.readFileSync(file, "utf8").toString();
        return expandImports(imported, file);
      }
    );
  }

  function removePrefixed(content, hasPrefixedFilter) {
    const lines = content.split(/\r?\n/g);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!hasPrefixedFilter(line)) {
        i++;
        continue;
      }
      if (/\{\s*$/.test(line)) {
        let bracketLevel = 1;
        let j = i + 1;
        while (j < lines.length && bracketLevel > 0) {
          const checkBracket = /([{}])\s*$/.exec(lines[j]);
          if (checkBracket) {
            if (checkBracket[1] === "{") {
              bracketLevel++;
            } else if (!lines[j].includes("{")) {
              bracketLevel--;
            }
          }
          j++;
        }
        lines.splice(i, j - i);
      } else if (/[};]\s*$/.test(line)) {
        lines.splice(i, 1);
      } else {
        // multiline? skipping until next directive or bracket
        do {
          lines.splice(i, 1);
        } while (
          i < lines.length &&
          !/\}\s*$/.test(lines[i]) &&
          !lines[i].includes(":")
        );
        if (i < lines.length && /\S\s*}\s*$/.test(lines[i])) {
          lines[i] = lines[i].substring(lines[i].indexOf("}"));
        }
      }
      // collapse whitespaces
      while (lines[i] === "" && lines[i - 1] === "") {
        lines.splice(i, 1);
      }
    }
    return lines.join("\n");
  }

  if (!mode) {
    throw new Error("Invalid CSS preprocessor mode");
  }

  let content = fs.readFileSync(source, "utf8").toString();
  content = expandImports(content, source);
  if (mode === "mozcentral") {
    content = removePrefixed(content, hasPrefixedMozcentral);
    // In the mozcentral version the color theme should be based on the Firefox
    // theme instead of the system theme.
    content = content.replace(
      "prefers-color-scheme",
      "-moz-toolbar-prefers-color-scheme"
    );
  }
  fs.writeFileSync(destination, content);
}
exports.preprocessCSS = preprocessCSS;

/**
 * Merge two defines arrays. Values in the second param will override values in
 * the first.
 */
function merge(defaults, defines) {
  const ret = Object.create(null);
  for (const key in defaults) {
    ret[key] = defaults[key];
  }
  for (const key in defines) {
    ret[key] = defines[key];
  }
  return ret;
}
exports.merge = merge;
