const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const editor = require("editor");
const moment = require("moment");
const semver = require("semver");
const ncp = require("copy-paste");

const cwd = process.cwd();
const filename = "CHANGELOG.md";

function fatal(msg) {
    console.log(chalk.red(`fatal: ${msg}`));
    process.exit(1);
}

async function read() {
    let file = path.join(cwd, filename);

    return new Promise(resolve => {
        fs.readFile(file, "utf8", (err, data) => {
            if (err) fatal(`Could not find a ${filename} file in ${cwd}`);
            else resolve(data);
        });
    });
}

async function write(changelog) {
    let file = path.join(cwd, filename);
    let string = stringify(changelog);

    return new Promise(resolve => {
        fs.writeFile(file, string, err => {
            if (err) fatal(`Could not write to ${filename}`);
            else resolve();
        });
    });
}

function parse(data) {
    let lines = data.split("\n");

    let links = parseLinks(lines);
    let releases = parseReleases(lines, links);

    return releases;

    function parseLinks(lines) {
        let links = {};
        let linesWithoutLinks = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let isLink = (line.split(/\[.*\]:/).length > 1);

            if (!isLink) linesWithoutLinks.push(line);
            else {
                let link = line.split(": ")[1].trim();
                let version = line.split(": ")[0].split("[").join("").split("]").join("").trim();

                links[version] = link;
            }
        }

        lines = linesWithoutLinks;
        return links;
    }

    function parseReleases(lines, links) {
        let output = [];
        let releases = data.split("\n## ").slice(1);

        for (let i = 0; i < releases.length; i++) {
            let release = releases[i];

            let rawVersion = release.split(" ")[0].split("\n")[0];
            let version = rawVersion.split("[").join("").split("]").join("");
            let released = (version !== "Unreleased");
            let date = released ? new Date(release.split(" ")[2].split("\n")[0]) : null;
            let link = (version == rawVersion) ? false : links[version];

            let content = {};

            let headers = release.split("\n### ");
            headers.splice(0, 1);
            for (let j = 0; j < headers.length; j++) {
                let header = headers[j].split("\n")[0];
                let notes = headers[j].split("\n- ");
                notes.splice(0, 1);

                for (let k = 0; k < notes.length; k++) {
                    notes[k] = notes[k].split("\n").join(" ").trim();
                }

                content[header] = notes;
            }

            output.push({ version, released, date, link, content });
        }

        return output;
    }
}

// TODO: Refactor this section, as it was just copied over
function stringify(data) {
    let output = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n";
    let linkString = "";

    // Loop over the data
    for (let i = 0; i < data.length; i++) {

        // Get release data
        let release = data[i];

        // Create the release string
        let releaseString = "";

        // Get the release version
        if (release.link) {
            releaseString = "## [" + release.version + "]";
            linkString += "[" + release.version + "]: " + release.link + "\n";
        } else {
            releaseString = "## " + release.version;
        }

        // Get the release date
        if (release.date) {
            releaseString += " - " + moment.utc(release.date).format("YYYY-MM-DD");
        }

        // Loop over expected content in the correct order
        let headers = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
        for (let j = 0; j < headers.length; j++) {

            // Get the header
            let header = headers[j];

            // Check whether it exists
            if (release.content[header]) {

                // It exists, loop over inner content
                releaseString += "\n\n### " + header + "\n";
                for (let k = 0; k < release.content[header].length; k++) {
                    releaseString += "\n- " + release.content[header][k];
                    if (k === (release.content[header].length - 1)) {
                        releaseString += "\n";
                    }
                }

            }

        }

        // Loop over any additional custom headers
        for (let key in release.content) {
            if (release.content.hasOwnProperty(key) && headers.indexOf(key) === -1) {
                releaseString += "\n### " + key;
                for (let j = 0; j < release.content[key].length; j++) {
                    releaseString += "\n- " + release.content[key][j];
                    if (j === (release.content[key].length - 1)) {
                        releaseString += "\n";
                    }
                }
            }
        }

        // End line
        releaseString += "\n";

        // Place releaseString into the final output
        output += releaseString;

    }

    // Add the links on the end
    output += linkString + "\n";

    // Normalise and return
    output = output.trim() + "\n";
    return output;
}

const cli = {
    init() {
        let file = path.join(cwd, filename);

        checkExists()
        .then(createNewFile)
        .catch(fatal);

        async function checkExists() {
            let exists = await fs.pathExists(file);

            if (exists) throw `There is already a ${filename} file in ${cwd}`;
            else return;
        }

        async function createNewFile() {
            let header = "# Change Log\nAll notable changes to this project will be documented in this file.\nThis project adheres to [Semantic Versioning](http://semver.org/).\n\n## Unreleased\n";

            fs.writeFile(file, header, err => {
                if (err) throw "Could not write a new changelog file";
                else console.log(`Initialized empty ${filename} in ${cwd}`);
            });
        }
    },

    async parse() {
        let changelog = await read();
        changelog = parse(changelog);
        let string = JSON.stringify(changelog, null, 4);

        console.log(string);
    },

    // TODO: Refactor this as most of it was just copied over
    async status() {
        let changelog = await read();
        changelog = parse(changelog);

        // The final status information
        let statusString = "";

        // Get information about the changelog
        if (!changelog[0].released) {
            if (changelog.length > 1) {
                statusString += "There have been " + (changelog.length - 1) + " versions released";
                statusString += "\nThe most recent of these being v" + changelog[1].version + " from " + moment(changelog[1].date).fromNow();
            } else {
                statusString += "The changelog has no releases to show";
            }

            // Check whether there is any unreleased content
            if (changelog[0].content) {

                statusString += "\n\nUnreleased content:\n  (use \"changelog bump [version | patch | minor | major]\" to release)\n";

                // Loop over the content
                for (let key in changelog[0].content) {
                    if (changelog[0].content.hasOwnProperty(key)) {

                        // Contain the inner string of the item
                        let itemString = "";

                        itemString += "\n  " + key + ":";
                        for (let i = 0; i < changelog[0].content[key].length; i++) {
                            itemString += "\n    - " + changelog[0].content[key][i];
                            if (i === (changelog[0].content[key].length - 1)) {
                                itemString += "\n";
                            }
                        }

                        // Add the item string to the status string with colors
                        switch (key) {
                            case "Added":
                                statusString += chalk.green(itemString);
                                break;
                            case "Changed":
                                statusString += chalk.yellow(itemString);
                                break;
                            case "Deprecated":
                                statusString += chalk.grey(itemString);
                                break;
                            case "Removed":
                                statusString += chalk.red(itemString);
                                break;
                            case "Fixed":
                                statusString += chalk.blue(itemString);
                                break;
                            case "Security":
                                statusString += chalk.magenta(itemString);
                                break;
                            default:
                                statusString += itemString;
                                break;
                        }

                    }
                }

            } else {
                statusString += "\nThere is no content in \"Unreleased\" to show";
            }

        } else {

            if (changelog.length === 1) {
                statusString += "There has been " + changelog.length + " version released";
            } else if (changelog.length > 1) {
                statusString += "There have been " + changelog.length + " versions released";
            }

            if (changelog.length > 0) {
                statusString += "\nThe most recent of these being v" + changelog[0].version + " from " + moment(changelog[0].date).fromNow();
            } else {
                statusString += "The changelog has no releases to show";
            }
        }

        // Write it to the console
        console.log(statusString);
    },

    copy() {
        fatal("Feature not yet implemented");
    },

    async destroy() {
        let file = path.join(cwd, filename);
        let exists = await fs.pathExists(file);

        if (exists) removeFile(file);
        else fatal(`There is no ${filename} to remove in ${cwd}`);

        async function removeFile(file) {
            fs.remove(file, err => {
                if (err) fatal(`Could not remove ${filename} in ${cwd}`);
                else console.log(`Successfully removed ${filename} in ${cwd}`);
            });
        }
    },

    // TODO: Uh oh, is that another refactor on the horizon, I think it is
    async bump(type) {
        let changelog = await read();
        changelog = parse(changelog);

        // Make sure there is content to bump
        if (changelog[0].released || Object.keys(changelog[0].content).length === 0) {
            fatal(`No ${filename} content available to perform version bump`);
        } else {

            // Get the previous version
            let version = (changelog.length > 1) ? changelog[1].version : "0.0.0";

            // Check the argument
            if (semver.valid(type)) {

                // Update to specific version
                changelog[0].version = type;
                changelog[0].released = true;
                changelog[0].date = new Date();

                // Save the updated file
                await write(changelog);
                console.log("Updated from " + version + " -> " + changelog[0].version);

            } else {

                // If the type has not been specified, default to patch
                type = (type === null || type === undefined) ? "patch" : type;

                switch (type) {
                    case "patch":
                    case "minor":
                    case "major":
                        changelog[0].version = semver.inc(version, type);
                        changelog[0].released = true;
                        changelog[0].date = new Date();

                        await write(changelog);
                        console.log("Updated from " + version + " -> " + changelog[0].version);
                        break;

                    default:
                        fatal(`"${type}" is not a valid version number or update type`);
                }

            }

        }
    },

    // TODO: Refactor this section, as it was just copied over
    async update(type) {
        let changelog = await read();
        changelog = parse(changelog);

        // Different words, phrases and text sections
        let header = "";
        let verb = "";
        let past = "";

        // Get the correct section header based on type
        switch (type) {
            case "add":
                header = "Added";
                verb = "added";
                past = "additions";
                break;
            case "change":
                header = "Changed";
                verb = "changed";
                past = "changes";
                break;
            case "deprecate":
                header = "Deprecated";
                verb = "deprecated";
                past = "deprecations";
                break;
            case "remove":
                header = "Removed";
                verb = "removed";
                past = "removals";
                break;
            case "fix":
                header = "Fixed";
                verb = "fixed";
                past = "fixes";
                break;
            case "secure":
                header = "Security";
                verb = "secured";
                past = "secures";
                break;
        }

        // Add unreleased header if one is not already present
        let newHeader = ""; // To show an additional message after creation
        if (!changelog.length) {
            changelog.unshift({
                version: "Unreleased",
                released: false,
                date: null,
                link: null,
                content: {}
            });
            newHeader = "\n# There was no content - creating new \"Unreleased\" header.";
        } else if (changelog[0].released) {
            changelog.unshift({
                version: "Unreleased",
                released: false,
                date: null,
                link: null,
                content: {}
            });
            newHeader = " - creating new \"Unreleased\" header.";
        }

        // Generate update edit message
        let msg = "\n# Please enter what you have " + verb + " in this new version. Lines\n# starting with '#' will be ignored and an empty message aborts\n# the update. Multiple lines will be treated as multiple " + past + ".";
        if (changelog.length > 1) {
            msg += "\n# Currently on version " + changelog[1].version;
        }
        msg += newHeader;
        msg += "\n#";

        // Create .UPDATE_EDITMSG file with above contents and open $EDITOR
        fs.writeFile(".UPDATE_EDITMSG", msg, function(err) {
            if (err) {
                fatal(`Could not create temporary file in ${cwd}`);
            } else {
                editor(".UPDATE_EDITMSG", function(code, sig) {

                    // Get the content from the file
                    fs.readFile(".UPDATE_EDITMSG", "utf8", function(err, contents) {
                        if (err) {
                            fatal(`Could not read from temporary file in ${cwd}`);
                        } else {

                            // Delete/clean-up the temporary file
                            fs.unlink(".UPDATE_EDITMSG");

                            // Perform validation on update contents
                            let lines = contents.split("\n"); // Seperate into newlines
                            let items = []; // An array of the actual items to add
                            for (let i = 0; i < lines.length; i++) {

                                // Ignore lines with absolutely no content or start with "#"
                                if (lines[i].length > 0 && lines[i].split(" ").join("").split("")[0] !== "#") {
                                    items.push(lines[i]);
                                }

                            }

                            // Abort if no content
                            if (items.length === 0) {
                                fatal("No message was supplied, so the update was aborted");
                            } else {

                                // Make sure header exists
                                if (!changelog[0].content[header]) {
                                    changelog[0].content[header] = [];
                                }

                                // For each update item, add it to the changelog
                                for (let i = 0; i < items.length; i++) {
                                    changelog[0].content[header].push(items[i]);
                                }

                                // Stringify and save to file
                                let data = stringify(changelog);
                                fs.writeFile("CHANGELOG.md", data, function(err) {
                                    if (err) {
                                        fatal(`Could not write updated ${filename}`);
                                    } else {

                                        // Make sure pluralisation of "item" is correct
                                        if (items.length === 1) {
                                            console.log("Added " + items.length + " item to \"" + header + "\"");
                                        } else {
                                            console.log("Added " + items.length + " items to \"" + header + "\"");
                                        }

                                    }
                                });
                            }
                        }
                    });
                });
            }
        });
    }
};

module.exports = {
    cli,
    stringify,
    parse
};
