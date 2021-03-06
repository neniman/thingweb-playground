const fs = require('fs');
const isUtf8 = require('is-utf8');
var Ajv = require('ajv');
const Json2csvParser = require('json2csv').Parser;
var jsonValidator = require('json-dup-key-validator');
const csvjson = require('csvjson');

var secondArgument;

const draftLocation = "./json-schema-draft-06.json";

const fields = ['ID', 'Status', 'Comment'];
const json2csvParser = new Json2csvParser({
    fields
});
var results = [];

const bcp47pattern = /^(?:(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))$|^((?:[a-z]{2,3}(?:(?:-[a-z]{3}){1,3})?)|[a-z]{4}|[a-z]{5,8})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?((?:-(?:[\da-z]{5,8}|\d[\da-z]{3}))*)?((?:-[\da-wy-z](?:-[\da-z]{2,8})+)*)?(-x(?:-[\da-z]{1,8})+)?$|^(x(?:-[\da-z]{1,8})+)$/i; // eslint-disable-line max-len

var nonImplementedAssertions = fetchManualAssertions();
// Takes the second argument as the TD to validate

if (process.argv[2]) {
    //console.log("there is second arg");
    if (typeof process.argv[2] === "string") {
        console.log("Taking input ", process.argv[2]);
        secondArgument = process.argv[2];
    } else {
        console.error("Second argument should be string");
        throw "Argument error";
    }
} else {
    console.error("There is NO second argument, put the location of the TD or of the directory with TDs");
    throw "Argument error";
}

if (process.argv[3]) {
    //console.log("there is second arg");
    if (typeof process.argv[3] === "string") {
        console.log("Taking output ", process.argv[3]);
        var outputLocation = process.argv[3];
        console.log("Validating a single TD and outputting result to ", outputLocation)
        var storedTdAddress = secondArgument;
        validate(storedTdAddress, outputLocation);
    } else {
        console.error("Second argument should be string");
        throw "Argument error";
    }
} else {

    try {
        // check if it is a directory
        var dirLocation = secondArgument;
        var tdList = fs.readdirSync(dirLocation);
        console.log("Validating an Implementation with Multiple TDs")
        tdList.forEach((curTD) => {
            validate(dirLocation + curTD);
        });
    } catch (error) {
        // not a directory so take the TD, hopefully
        console.log("Validating a single TD")
        var storedTdAddress = secondArgument;
        validate(storedTdAddress);
    }
}

function validate(storedTdAddress, outputLocation) {
    console.log("=================================================================")
    console.log("Taking TD found at ", storedTdAddress, " for validation");
    var tdData = fs.readFileSync(storedTdAddress);


    // check whether it is a valid UTF-8 string
    if (isUtf8(tdData)) {
        results.push({
            "ID": "td-json-open_utf-8",
            "Status": "pass"
        });
    } else {
        results.push({
            "ID": "td-json-open_utf-8",
            "Status": "fail"
        });
        console.log("INVALID TD, SKIPPING TO NEXT TD");
        toOutput("invalid-td-cant-get-id");
        results = [];
        return;
    }


    //check whether it is a valid JSON
    try {
        var tempTd = JSON.parse(tdData);
        results.push({
            "ID": "td-json-open",
            "Status": "pass"
        });
    } catch (error) {
        results.push({
            "ID": "td-json-open",
            "Status": "fail"
        });
        console.log("INVALID TD, SKIPPING TO NEXT TD");
        toOutput("invalid-td-cant-get-id");
        results = [];
        return;

    }

    var tdDataString = tdData.toString();

    var tdJson = checkUniqueness(tdDataString);

    var test = checkVocabulary(tdJson);

    if (!test) {
        console.log("INVALID TD, SKIPPING TO NEXT TD");
        toOutput(tdJson.id);
        results = [];
        return;
    } else {

        // additional checks
        checkSecurity(tdJson);
        checkMultiLangConsistency(tdJson);


        var draftData = fs.readFileSync(draftLocation);
        var draft = JSON.parse(draftData);

        // Iterating through assertions

        var assertions = fs.readdirSync("./Assertions/");
        assertions.forEach((curAssertion, index) => {

            var schemaLocation = "./Assertions/" + curAssertion;

            var schemaData = fs.readFileSync(schemaLocation);

            // console.log("Taking Assertion Schema found at ", schemaLocation);
            var schema = JSON.parse(schemaData);

            // Validation starts here

            const avj_options = {
                "$comment": function (v) {
                    console.log("\n!!!! COMMENT", v)
                },
                "allErrors": true
            };
            var ajv = new Ajv(avj_options);
            ajv.addMetaSchema(draft);
            ajv.addSchema(schema, 'td');


            var valid = ajv.validate('td', tdJson);

            /*
                If valid then it is not implemented
                if error says not-impl then it is not implemented
                If somehow error says fail then it is failed

                Output is structured as follows:
                [main assertion]:[sub assertion if exists]=[result]
            */
            if (schema["is-complex"]) {
                if (valid) {
                    // console.log('Assertion ' + schema.title + ' not implemented');
                    results.push({
                        "ID": schema.title,
                        "Status": "not-impl"
                    });
                    if (schema.hasOwnProperty("also")) {
                        var otherAssertions = schema.also;
                        otherAssertions.forEach(function (asser) {
                            results.push({
                                "ID": asser,
                                "Status": "not-impl"
                            });
                        });
                    }

                } else {
                    // console.log(ajv.errors);
                    try {
                        var output = ajv.errors[0].params.allowedValue;

                        var resultStart = output.indexOf("=");
                        var result = output.slice(resultStart + 1);

                        if (result == "pass") {
                            results.push({
                                "ID": schema.title,
                                "Status": result
                            });
                        } else {
                            results.push({
                                "ID": schema.title,
                                "Status": result,
                                "Comment": ajv.errorsText()
                            });
                        }
                        if (schema.hasOwnProperty("also")) {
                            var otherAssertions = schema.also;
                            otherAssertions.forEach(function (asser) {
                                results.push({
                                    "ID": asser,
                                    "Status": result
                                });
                            });
                        }
                        //there was some other error, so it is fail
                    } catch (error1) {
                        results.push({
                            "ID": schema.title,
                            "Status": "fail",
                            "Comment": "Make sure you validate your TD before"
                        });

                        if (schema.hasOwnProperty("also")) {
                            var otherAssertions = schema.also;
                            otherAssertions.forEach(function (asser) {
                                results.push({
                                    "ID": asser,
                                    "Status": "fail",
                                    "Comment": "Make sure you validate your TD before"
                                });
                            });
                        }
                    }
                }

            } else {
                if (valid) {
                    // console.log('Assertion ' + schema.title + ' implemented');
                    results.push({
                        "ID": schema.title,
                        "Status": "pass"
                    });
                    if (schema.hasOwnProperty("also")) {
                        var otherAssertions = schema.also;
                        otherAssertions.forEach(function (asser) {
                            results.push({
                                "ID": asser,
                                "Status": "pass"
                            });
                        });
                    }
                } else {
                    // failed because a required is not implemented
                    // console.log('> ' + ajv.errorsText());
                    if (ajv.errorsText().indexOf("required") > -1) {
                        //failed because it doesnt have required key which is a non implemented feature
                        // console.log('Assertion ' + schema.title + ' not implemented');
                        results.push({
                            "ID": schema.title,
                            "Status": "not-impl",
                            "Comment": ajv.errorsText()
                        });
                        if (schema.hasOwnProperty("also")) {
                            var otherAssertions = schema.also;
                            otherAssertions.forEach(function (asser) {
                                results.push({
                                    "ID": asser,
                                    "Status": "not-impl",
                                    "Comment": ajv.errorsText()
                                });
                            });
                        }
                    } else {
                        //failed because of some other reason
                        // console.log('Assertion ' + schema.title + ' failed');
                        results.push({
                            "ID": schema.title,
                            "Status": "fail",
                            "Comment": ajv.errorsText()
                        });
                        if (schema.hasOwnProperty("also")) {
                            var otherAssertions = schema.also;
                            otherAssertions.forEach(function (asser) {
                                results.push({
                                    "ID": asser,
                                    "Status": "fail",
                                    "Comment": ajv.errorsText()
                                });
                            });
                        }
                    }
                }
            }


            // If reached the end
            if (index == assertions.length - 1) {
                // create parent assertions
                toOutput(tdJson.id);
            }
        });
    }
}

function toOutput(tdId) {
    results = mergeIdenticalResults(results);
    createParents(results);

    // Push the non implemented assertions
    nonImplementedAssertions = fetchManualAssertions();
    nonImplementedAssertions.forEach((curNonImpl) => {
        results.push({
            "ID": curNonImpl,
            "Status": "null",
            "Comment": "not testable with Assertion Tester"
        });
    });

    // sort according to the ID in each item
    orderedResults = results.sort(function (a, b) {
        var idA = a.ID;
        var idB = b.ID;
        if (idA < idB) {
            return -1;
        }
        if (idA > idB) {
            return 1;
        }

        // if ids are equal
        return 0;
    });

    var csvResults = json2csvParser.parse(orderedResults);
    results = [];

    //if output is specified output there
    if (outputLocation) {

        fs.writeFile(outputLocation, csvResults, function (err) {
            if (err) {
                return console.log(err);
            }

            console.log("The csv was saved!");
        });

    } else {
        //otherwise to console and save to default directories
        console.log(csvResults);

        var fileName = tdId.replace(/:/g, "_");
        fs.writeFile("./Results/result-" + fileName + ".json", JSON.stringify(orderedResults),
            function (err) {
                if (err) {
                    return console.log(err);
                }

                console.log("The result-" + fileName + ".json is saved!");
            });

        fs.writeFile("./Results/result-" + fileName + ".csv", csvResults, function (err) {
            if (err) {
                return console.log(err);
            }

            console.log("The result-" + fileName + ".csv is saved!");
        });
    }
}

function mergeIdenticalResults(resultsJSON) {
    // first generate a list of results that appear more than once
    // it should be a JSON object, keys are the assertion ids and the value is an array
    // while putting these results, remove them from the results FIRST
    // then for each key, find the resulting result: 
    //if one fail total fail, if one pass and no fail then pass, otherwise not-impl

    var identicalResults = {};
    resultsJSON.forEach((curResult, index) => {
        var curId = curResult.ID;

        // remove this one, but add it back if there is no duplicate
        resultsJSON.splice(index, 1);
        // check if there is a second one
        const identicalIndex = resultsJSON.findIndex(x => x.ID === curId);

        if (identicalIndex > 0) { //there is a second one

            // check if it already exists
            if (identicalResults.hasOwnProperty(curId)) {
                // push if it already exists
                identicalResults[curId].push(curResult.Status)
            } else {
                // create a new array with values if it does not exist
                identicalResults[curId] = [curResult.Status]
            }
            // put it back such that the last identical can find its duplicate that appeared before
            resultsJSON.unshift(curResult);
            // process.exit();
        } else {
            // if there is no duplicate, put it back into results but at the beginning 
            resultsJSON.unshift(curResult);
        }
    });

    //get the keys to iterate through
    var identicalKeys = Object.keys(identicalResults)

    // iterate through each duplicate, calculate the new result, set the new result and then remove the duplicates 
    identicalKeys.forEach((curKey) => {
        var curResults = identicalResults[curKey];
        var newResult;

        if (curResults.indexOf("fail") >= 0) {
            newResult = "fail"
        } else if (curResults.indexOf("pass") >= 0) {
            newResult = "pass"
        } else {
            newResult = "not-impl"
        }
        //delete each of the duplicate
        while (resultsJSON.findIndex(x => x.ID === curKey) >= 0) {
            resultsJSON.splice(resultsJSON.findIndex(x => x.ID === curKey), 1);
        }

        // push back the new result
        resultsJSON.push({
            "ID": curKey,
            "Status": newResult,
            "Comment": "result of a merge"
        });

    });
    return resultsJSON;
}

function createParents(resultsJSON) {

    //create a json object with parent name keys and then each of them an array of children results

    var parentsJson = {};
    resultsJSON.forEach((curResult, index) => {
        var curId = curResult.ID;
        var underScoreLoc = curId.indexOf('_');
        if (underScoreLoc === -1) {
            // this assertion is not a child assertion
        } else {
            var parentResultID = curId.slice(0, underScoreLoc);
            // if it already exists push otherwise create an array and push
            if (parentsJson.hasOwnProperty(parentResultID)) {
                parentsJson[parentResultID].push(curResult);
            } else {
                parentsJson[parentResultID] = [];
                parentsJson[parentResultID].push(curResult);
            }
            // console.log(parentsJson);
        }
    });

    //Go through the object and push a result that is an OR of each children
    // if one children is fail, result is fail
    // if one children is not-impl, result is not-impl
    // if none of these happen, then it implies it is pass, so result is pass
    // "ID": schema.title,
    // "Status": "not-impl" 

    parentsJsonArray = Object.getOwnPropertyNames(parentsJson);
    parentsJsonArray.forEach((curParentName, indexParent) => {

        var curParent = parentsJson[curParentName];

        for (let index = 0; index < curParent.length; index++) {
            const curChild = curParent[index];
            if (curChild.Status == "fail") {
                //push fail and break, i.e stop going through children, we are done here!
                results.push({
                    "ID": curParentName,
                    "Status": "fail",
                    "Comment": "Error message can be seen in the children assertions"
                });
                break;
            } else if (curChild.Status == "not-impl") {
                //push not-impl and break, i.e stop going through children, we are done here!
                results.push({
                    "ID": curParentName,
                    "Status": "not-impl",
                    "Comment": "Error message can be seen in the children assertions"
                });
                break;
            } else {
                // if reached the end without break, push pass
                if (index == curParent.length - 1) {
                    results.push({
                        "ID": curParentName,
                        "Status": "pass",
                    });
                }
            }
        }
    });

}

function checkVocabulary(tdJson) {
    /*
    Validates the following assertions:
    td-vocabulary
    td-objects:securityDefinitions
    td-arrays:security
    td:security
    td-security-mandatory
    */
    var draftData = fs.readFileSync(draftLocation)

    // console.log("Taking Schema Draft found at ", draftLocation);
    var draft = JSON.parse(draftData);

    var schemaData = fs.readFileSync("../WebContent/td-schema.json");

    // console.log("Taking td-schema")

    var schema = JSON.parse(schemaData);

    var ajv = new Ajv();
    ajv.addMetaSchema(draft);
    ajv.addSchema(schema, 'td');

    var valid = ajv.validate('td', tdJson);
    var otherAssertions = ["td-objects_securityDefinitions", "td-arrays_security", "td-vocab-security--Thing", "td-security-mandatory", "td-vocab-securityDefinitions--Thing", "td-context-toplevel", "td-vocab-title--Thing", "td-vocab-security--Thing", "td-vocab-id--Thing", "td-security", "td-security-activation", "td-context-ns-thing-mandatory", "td-map-type", "td-array-type", "td-class-type", "td-string-type", "td-security-schemes"];

    if (valid) {
        results.push({
            "ID": "td-vocabulary",
            "Status": "pass",
        });

        otherAssertions.forEach(function (asser) {
            results.push({
                "ID": asser,
                "Status": "pass"
            });
        });
        return true;

    } else {
        console.log("VALIDATION ERROR!!! : ", ajv.errorsText());
        results.push({
            "ID": "td-vocabulary",
            "Status": "fail",
            "Comment": "invalid TD"
        });
        otherAssertions.forEach(function (asser) {
            results.push({
                "ID": asser,
                "Status": "fail"
            });
        });
        return false;
    }
}

function checkUniqueness(tdString) {

    // There are two things being checked here:
    // Whether in one interaction pattern there are duplicate names, e.g. two properties called temp
    // And if all interaction patterns combined have duplicates, e.g. a property and action called light

    // However, if there are no properties then it is not-impl

    // jsonvalidator throws an error if there are duplicate names in the interaction level
    try {
        jsonValidator.parse(tdString, false);

        var td = JSON.parse(tdString);

        // no problem in interaction level
        var tdInteractions = [];

        // checking whether there are properties at all, if not uniqueness is not impl
        if (td.hasOwnProperty("properties")) {
            tdInteractions = tdInteractions.concat(Object.keys(td.properties));
            // then we can add unique properties pass 
            results.push({
                "ID": "td-properties_uniqueness",
                "Status": "pass",
                "Comment": ""
            });
        } else {
            // then we add unique properties as not impl
            results.push({
                "ID": "td-properties_uniqueness",
                "Status": "not-impl",
                "Comment": "no properties"
            });
        }

        if (td.hasOwnProperty("actions")) {
            tdInteractions = tdInteractions.concat(Object.keys(td.actions));
            results.push({
                "ID": "td-actions_uniqueness",
                "Status": "pass",
                "Comment": ""
            });
        } else {
            // then we add unique actions as not impl
            results.push({
                "ID": "td-actions_uniqueness",
                "Status": "not-impl",
                "Comment": "no actions"
            });
        }

        if (td.hasOwnProperty("events")) {
            tdInteractions = tdInteractions.concat(Object.keys(td.events));
            results.push({
                "ID": "td-events_uniqueness",
                "Status": "pass",
                "Comment": ""
            });
        } else {
            // then we add unique events as not impl
            results.push({
                "ID": "td-events_uniqueness",
                "Status": "not-impl",
                "Comment": "no events"
            });
        }

        // if (tdInteractions.length > 0) {
        //     // checking uniqueness between interactions
        //     isDuplicate = (new Set(tdInteractions)).size !== tdInteractions.length;

        //     if (isDuplicate) {
        //         // if all is unique, then interactions are unique
        //         results.push({
        //             "ID": "td-unique-identifiers",
        //             "Status": "fail",
        //             "Comment": "duplicate interaction names"
        //         });

        //     } else {
        //         results.push({
        //             "ID": "td-unique-identifiers",
        //             "Status": "pass"
        //         });
        //     }
        // } else {
        //     results.push({
        //         "ID": "td-unique-identifiers",
        //         "Status": "not-impl",
        //         "Comment":"There are no interactions"
        //     });
        // }
        return td;
    } catch (error) {
        // there is a duplicate somewhere
        // results.push({
        //     "ID": "td-unique-identifiers",
        //     "Status": "fail",
        //     "Comment": "duplicate interaction names"
        // });

        // convert it into string to be able to process it
        // error is of form = Error: Syntax error: duplicated keys "overheating" near ting": {
        var errorString = error.toString();
        // to get the name, we need to remove the quotes around it
        var startQuote = errorString.indexOf('"');
        // slice to remove the part before the quote
        var restString = errorString.slice(startQuote + 1);
        // find where the interaction name ends
        var endQuote = restString.indexOf('"');
        // finally get the interaction name
        var interactionName = restString.slice(0, endQuote);

        //trying to find where this interaction is and put results accordingly
        var td = JSON.parse(tdString);

        if (td.hasOwnProperty("properties")) {
            var tdProperties = td.properties;
            if (tdProperties.hasOwnProperty(interactionName)) {
                //duplicate was at properties but that fails the td-unique identifiers as well
                // console.log("at property");
                results.push({
                    "ID": "td-properties_uniqueness",
                    "Status": "fail",
                    "Comment": "duplicate property names"
                });
                // since JSON.parse removes duplicates, we replace the duplicate name with duplicateName
                tdString = tdString.replace(interactionName, "duplicateName");

            } else {
                // there is duplicate but not here, so pass
                results.push({
                    "ID": "td-properties_uniqueness",
                    "Status": "pass",
                    "Comment": ""
                });
            }
        } else {
            results.push({
                "ID": "td-properties_uniqueness",
                "Status": "not-impl",
                "Comment": "no properties"
            });
        }

        if (td.hasOwnProperty("actions")) {
            var tdActions = td.actions;
            if (tdActions.hasOwnProperty(interactionName)) {
                //duplicate was at actions but that fails the td-unique identifiers as well
                // console.log("at action");
                results.push({
                    "ID": "td-actions_uniqueness",
                    "Status": "fail",
                    "Comment": "duplicate action names"
                });
                // since JSON.parse removes duplicates, we replace the duplicate name with duplicateName
                tdString = tdString.replace(interactionName, "duplicateName");
            } else {
                results.push({
                    "ID": "td-actions_uniqueness",
                    "Status": "pass",
                    "Comment": ""
                });
            }
        } else {
            results.push({
                "ID": "td-actions_uniqueness",
                "Status": "not-impl",
                "Comment": "no actions"
            });
        }

        if (td.hasOwnProperty("events")) {
            var tdEvents = td.events;
            if (tdEvents.hasOwnProperty(interactionName)) {
                //duplicate was at events but that fails the td-unique identifiers as well
                // console.log("at event");
                results.push({
                    "ID": "td-events_uniqueness",
                    "Status": "fail",
                    "Comment": "duplicate event names"
                });
                // since JSON.parse removes duplicates, we replace the duplicate name with duplicateName
                tdString = tdString.replace(interactionName, "duplicateName");
            } else {
                results.push({
                    "ID": "td-events_uniqueness",
                    "Status": "pass",
                    "Comment": ""
                });
            }
        } else {
            results.push({
                "ID": "td-events_uniqueness",
                "Status": "not-impl",
                "Comment": "no events"
            });
        }

        return JSON.parse(tdString);
    }
}

function fetchManualAssertions() {

    var manualCsv = fs.readFileSync("./manual.csv").toString();

    var options = {
        delimiter: ',', // optional
        quote: '"' // optional
    };

    var manualJSON = csvjson.toColumnArray(manualCsv, options);
    var manualIdList = manualJSON.ID;
    return manualIdList;
}

function securityContains(parent, child) {

    //security anywhere could be a string or array. Convert string to array
    if (typeof child == "string") {
        child = [child];
    }
    return child.every(elem => parent.indexOf(elem) > -1);
}

function checkSecurity(td) {
    if (td.hasOwnProperty("securityDefinitions")) {
        var securityDefinitionsObject = td.securityDefinitions;
        var securityDefinitions = Object.keys(securityDefinitionsObject);


        var rootSecurity = td.security;

        if (securityContains(securityDefinitions, rootSecurity)) {
            // all good
        } else {
            results.push({
                "ID": "td-security-scheme-name",
                "Status": "fail",
                "Comment": "used a non defined security scheme in root level"
            });
            return;
        }

        if (td.hasOwnProperty("properties")) {
            //checking security in property level
            tdProperties = Object.keys(td.properties);
            for (var i = 0; i < tdProperties.length; i++) {
                var curPropertyName = tdProperties[i];
                var curProperty = td.properties[curPropertyName];

                // checking security in forms level
                var curForms = curProperty.forms;
                for (var j = 0; j < curForms.length; j++) {
                    var curForm = curForms[j];
                    if (curForm.hasOwnProperty("security")) {
                        var curSecurity = curForm.security;
                        if (securityContains(securityDefinitions, curSecurity)) {
                            // all good
                        } else {
                            results.push({
                                "ID": "td-security-scheme-name",
                                "Status": "fail",
                                "Comment": "used a non defined security scheme in a property form"
                            });
                            return;
                        }
                    }
                }
            }
        }

        if (td.hasOwnProperty("actions")) {
            //checking security in action level
            tdActions = Object.keys(td.actions);
            for (var i = 0; i < tdActions.length; i++) {
                var curActionName = tdActions[i];
                var curAction = td.actions[curActionName];

                // checking security in forms level 
                var curForms = curAction.forms;
                for (var j = 0; j < curForms.length; j++) {
                    var curForm = curForms[j];
                    if (curForm.hasOwnProperty("security")) {
                        var curSecurity = curForm.security;
                        if (securityContains(securityDefinitions, curSecurity)) {
                            // all good
                        } else {
                            results.push({
                                "ID": "td-security-scheme-name",
                                "Status": "fail",
                                "Comment": "used a non defined security scheme in an action form"
                            });
                            return;
                        }
                    }
                }

            }
        }

        if (td.hasOwnProperty("events")) {
            //checking security in event level
            tdEvents = Object.keys(td.events);
            for (var i = 0; i < tdEvents.length; i++) {
                var curEventName = tdEvents[i];
                var curEvent = td.events[curEventName];

                // checking security in forms level
                var curForms = curEvent.forms;
                for (var j = 0; j < curForms.length; j++) {
                    var curForm = curForms[j];
                    if (curForm.hasOwnProperty("security")) {
                        var curSecurity = curForm.security;
                        if (securityContains(securityDefinitions, curSecurity)) {
                            // all good
                        } else {
                            results.push({
                                "ID": "td-security-scheme-name",
                                "Status": "fail",
                                "Comment": "used a non defined security scheme in an event form"
                            });
                            return;
                        }
                    }
                }

            }
        }

        //no security used non defined scheme, passed test
        results.push({
            "ID": "td-security-scheme-name",
            "Status": "pass"
        });
        return;

    } else {}
    return;
}

function checkMultiLangConsistency(td) {

    // this checks whether all titles and descriptions have the same language fields 
    // so the object keys of a titles and of a descriptions should be the same already, then everywhere else they should also be the same

    // first collect them all, and then compare them

    var multiLang = []; //an array of arrays where each small array has the multilang keys
    var is_td_titles_descriptions = []; // an array of boolean values to check td-titles-descriptions assertion

    // checking root
    if (td.hasOwnProperty("titles")) {
        var rootTitlesObject = td.titles;
        var rootTitles = Object.keys(rootTitlesObject);
        multiLang.push(rootTitles);
        //checking for td-titles-descriptions
        is_td_titles_descriptions.push({["root_title"]: isStringObjectKeyValue(td.title, rootTitlesObject)});
    }

    if (td.hasOwnProperty("descriptions")) {
        var rootDescriptionsObject = td.descriptions;
        var rootDescriptions = Object.keys(rootDescriptionsObject);
        multiLang.push(rootDescriptions);
        // check whether description exists in descriptions
        if (td.hasOwnProperty("description")) is_td_titles_descriptions.push({["root_description"]: isStringObjectKeyValue(td.description, rootDescriptionsObject)})
    }

    // checking inside each interaction
    if (td.hasOwnProperty("properties")) {
        //checking security in property level
        tdProperties = Object.keys(td.properties);
        for (var i = 0; i < tdProperties.length; i++) {
            var curPropertyName = tdProperties[i];
            var curProperty = td.properties[curPropertyName];

            if (curProperty.hasOwnProperty("titles")) {
                var titlesKeys = Object.keys(curProperty.titles);
                multiLang.push(titlesKeys);
                //checking if title exists in titles
                if (curProperty.hasOwnProperty("title")) is_td_titles_descriptions.push({["property_"+curPropertyName + "_title"]: isStringObjectKeyValue(curProperty.title, curProperty.titles)})
            }

            if (curProperty.hasOwnProperty("descriptions")) {
                var descriptionsKeys = Object.keys(curProperty.descriptions);
                multiLang.push(descriptionsKeys);
                // checking if description exists in descriptions
                if (curProperty.hasOwnProperty("description")) is_td_titles_descriptions.push({["property_" + curPropertyName + "_desc"]: isStringObjectKeyValue(curProperty.description, curProperty.descriptions)
                })
            }
        }
    }

    if (td.hasOwnProperty("actions")) {
        //checking security in action level
        tdActions = Object.keys(td.actions);
        for (var i = 0; i < tdActions.length; i++) {
            var curActionName = tdActions[i];
            var curAction = td.actions[curActionName];

            if (curAction.hasOwnProperty("titles")) {
                var titlesKeys = Object.keys(curAction.titles);
                multiLang.push(titlesKeys);
                //checking if title exists in titles
                if (curAction.hasOwnProperty("title")) is_td_titles_descriptions.push({["action_" + curActionName + "_title"]: isStringObjectKeyValue(curAction.title, curAction.titles)
                })
            }

            if (curAction.hasOwnProperty("descriptions")) {
                var descriptionsKeys = Object.keys(curAction.descriptions);
                multiLang.push(descriptionsKeys);
                // checking if description exists in descriptions
                if (curAction.hasOwnProperty("description")) is_td_titles_descriptions.push({["action_" + curActionName + "_desc"]: isStringObjectKeyValue(curAction.description, curAction.descriptions)
                            })
            }

        }
    }

    if (td.hasOwnProperty("events")) {
        //checking security in event level
        tdEvents = Object.keys(td.events);
        for (var i = 0; i < tdEvents.length; i++) {
            var curEventName = tdEvents[i];
            var curEvent = td.events[curEventName];

            if (curEvent.hasOwnProperty("titles")) {
                var titlesKeys = Object.keys(curEvent.titles);
                multiLang.push(titlesKeys);
                //checking if title exists in titles
                if (curEvent.hasOwnProperty("title")) is_td_titles_descriptions.push({["event_" + curEventName + "_title"]: isStringObjectKeyValue(curEvent.title, curEvent.titles)
                            })
            }

            if (curEvent.hasOwnProperty("descriptions")) {
                var descriptionsKeys = Object.keys(curEvent.descriptions);
                multiLang.push(descriptionsKeys);
                // checking if description exists in descriptions
                if (curEvent.hasOwnProperty("description")) is_td_titles_descriptions.push({["event_" + curEventName + "_desc"]: isStringObjectKeyValue(curEvent.description, curEvent.descriptions)
                })
            }

        }
    }
    if(arrayArraysItemsEqual(multiLang)){
        results.push({
            "ID": "td-multi-languages-consistent",
            "Status": "pass"
        });
    } else {
        results.push({
            "ID": "td-multi-languages-consistent",
            "Status": "fail",
            "Comment": "not all multilang objects have same language tags"
        });
    }

    var flatArray = []; //this is multiLang but flat, so just a single array. This way we can have scan the whole thing at once and then find the element that is not bcp47
    for (let index = 0; index < multiLang.length; index++) {
        var arrayElement = multiLang[index];
        arrayElement=JSON.parse(arrayElement);
        for (let index = 0; index < arrayElement.length; index++) {
            const stringElement = arrayElement[index];
            flatArray.push(stringElement);
        }
    }
    var isBCP47 = checkBCP47array(flatArray);
    if(isBCP47=="ok"){
        results.push({
            "ID": "td-multilanguage-language-tag",
            "Status": "pass"
        });
    } else {
        results.push({
            "ID": "td-multilanguage-language-tag",
            "Status": "fail",
            "Comment":isBCP47+" is not a BCP47 tag"
        });
    }

    //checking td-context-default-language-direction-script assertion
    results.push({
        "ID": "td-context-default-language-direction-script",
        "Status": checkAzeri(flatArray)
    });

    // checking td-titles-descriptions assertion
    // if there are no multilang, then it is not impl
    if(is_td_titles_descriptions.length==0){
        results.push({
            "ID": "td-titles-descriptions",
            "Status": "not-impl",
            "Comment": "no multilang objects in the td"
        });
        return;
    }

    // if at some point there was a false result, it is a fail
    for (let index = 0; index < is_td_titles_descriptions.length; index++) {
        const element = is_td_titles_descriptions[index];
        var elementName = Object.keys(element);

        if(element[elementName]){
            // do nothing it is correct
        } else {
            results.push({
                "ID": "td-titles-descriptions",
                "Status": "fail",
                "Comment": elementName+" is not on the multilang object at the same level"
            });
            return;
        }
    }
    //there was no problem, so just put pass
    results.push({
        "ID": "td-titles-descriptions",
        "Status": "pass"
    });
    
    //nothing after this, there is return above

}

// checks if an array that contains only arrays as items is composed of same items
function arrayArraysItemsEqual(myArray) {
    if(myArray.length==0) return true;
    //first stringify each array item
    for (var i = myArray.length; i--;) {
        myArray[i] = JSON.stringify(myArray[i])
    }

    for (var i = myArray.length; i--;) {
        if (i == 0) {
            return true;
        }
        if (myArray[i] !== myArray[i - 1]){
            return false;
        }
    }
}

// checks whether the items of an array, which must be strings, are valid language tags
function checkBCP47array(myArray){
    // return tag name if one is not valid during the check

    for (let index = 0; index < myArray.length; index++) {
        const element = myArray[index];
        if (bcp47pattern.test(element)) {
            //keep going
        } else {
            return element;
        }
    } 
    
    // return true if reached the end
    return "ok";
}

function isStringObjectKeyValue(searchedString, searchedObject){
    // checks whether a given string exist as the value of key in an object
    var objKeys = Object.keys(searchedObject);
    if(objKeys.length==0) return false; // if the object is empty, then the string cannot exist here
    for (let index = 0; index < objKeys.length; index++) {
        const element = objKeys[index];
        if (searchedObject[element] == searchedString) {
            return true; // found where the string is in the object
        } else {
            //nothing keep going, maybe in another key
        }
    }
    return false;
}

// checks whether an azeri language tag also specifies the version (Latn or Arab).
// basically if the language is called "az", it is invalid, if it is az-Latn or az-Arab it is valid.
function checkAzeri(myMultiLangArray){
    for (let index = 0; index < myMultiLangArray.length; index++) {
        const element = myMultiLangArray[index];
        if (element =="az"){
            return "fail"
        } else if ((element == "az-Latn") || (element == "az-Arab")){
            return "pass"
        }
    }
    // no azeri, so it is not implemented
    return "not-impl"
}