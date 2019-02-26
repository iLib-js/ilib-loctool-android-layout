/*
 * AndroidLayoutFileType.js - tool to extract resources from source code
 *
 * Copyright © 2019, JEDLSoft
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var log4js = require("log4js");

var AndroidLayoutFile = require("./AndroidLayoutFile.js");

var logger = log4js.getLogger("loctool.lib.AndroidLayoutFile");

var AndroidLayoutFileType = function(project) {
    this.type = "java";
    this.datatype = "x-android-resource";

    this.project = project;
    this.API = this.project.getAPI();

    this.files = []; // all files of this type
    this.extensions = [ ".xml" ];

    this.extracted = this.API.newTranslationSet(project.getSourceLocale());
    this.newres = this.API.newTranslationSet(project.getSourceLocale());
    this.pseudo = this.API.newTranslationSet(project.getSourceLocale());
};

var extensionRE = new RegExp(/\.xml$/);
var dirRE = new RegExp("^(layout|menu|xml)");
var lang = new RegExp("[a-z][a-z]");
var reg = new RegExp("r[A-Z][A-Z]");
var fullLocale = /-b\+[a-z][a-z]\+[A-Z][a-z][a-z][a-z]\+[A-Z][A-Z]/;

AndroidLayoutFileType.prototype.getExtensions = function() {
    return this.extensions;
};

AndroidLayoutFileType.prototype.handles = function(pathName) {
    logger.debug("AndroidLayoutFileType handles " + pathName + "?");
    if (!extensionRE.test(pathName)) {
        logger.debug("No");
        return false;
    }

    var pathElements = pathName.split('/');
    if (pathElements.length < 3 || pathElements[pathElements.length-3] !== "res") {
        logger.debug("No");
        return false;
    }

    var dir = pathElements[pathElements.length-2];

    if (!dirRE.test(dir)) {
        logger.debug("No");
        return false;
    }

    if (fullLocale.test(dir)) {
        logger.debug("No");
        return false;
    }

    var parts = dir.split("-");

    for (var i = parts.length-1; i > 0; i--) {
        if (reg.test(parts[i]) && this.API.utils.iso3166[parts[i]]) {
            // already localized dir
            logger.debug("No");
            return false;
        }

        if (lang.test(parts[i]) && this.API.utils.iso639[parts[i]]) {
            // already localized dir
            logger.debug("No");
            return false;
        }
    }

    logger.debug("Yes");
    return true;
};

AndroidLayoutFileType.prototype.name = function() {
    return "Android Layout File Type";
};

/**
 * Write out the aggregated resources for this file type. In
 * some cases, the string are written out to a common resource
 * file, and in other cases, to a type-specific resource file.
 * In yet other cases, nothing is written out, as the each of
 * the files themselves are localized individually, so there
 * are no aggregated strings.
 * @param {TranslationSet} translations the set of translations from the
 * repository
 * @param {Array.<String>} locales the list of locales to localize to
 */
AndroidLayoutFileType.prototype.write = function(translations, locales) {
    // distribute all the resources to their resource files
    // and then let them write themselves out
    var resFileType = this.project.getResourceFileType();
    var res, file,
        resources = this.extracted.getAll(),
        db = this.project.db,
        translationLocales = locales.filter(function(locale) {
            return locale !== this.project.sourceLocale && locale !== this.project.pseudoLocale && !this.API.isPseudoLocale(locale);
        }.bind(this));

    logger.trace("Adding resources to resource files");

    for (var i = 0; i < resources.length; i++) {
        res = resources[i];
        file = resFileType.getResourceFile(res.context, res.getSourceLocale(), "strings", res.pathName);
        file.addResource(res);

        // for each extracted string, write out the translations of it
        translationLocales.forEach(function(locale) {
            logger.trace("Localizing Android layout strings to " + locale);

            db.getResourceByHashKey(res.hashKeyForTranslation(locale), function(err, translated) {
                var r = translated; // default to the source language if the translation is not there
                if (!translated || res.dnt) {
                    r = res.clone();
                    r.setTargetLocale(locale);
                    r.setTarget(r.getSource());
                    r.setState("new");

                    this.newres.add(r);

                    // skip to cause it to fall back to the english strings
                    logger.trace("No translation for " + res.reskey + " to " + locale);
                } else {
                    file = resFileType.getResourceFile(r.context, locale, "strings", r.pathName);
                    file.addResource(r);
                    logger.trace("Added " + r.reskey + " to " + file.pathName);
                }
            }.bind(this));
        }.bind(this));
    }

    resources = this.pseudo.getAll().filter(function(resource) {
        return resource.datatype === this.datatype;
    }.bind(this));

    for (var i = 0; i < resources.length; i++) {
        res = resources[i];
        // only add if the pseudo is different than the source
        if (res.getSource() != res.getTarget()) {
            file = resFileType.getResourceFile(res.context, res.getTargetLocale(), res.resType + "s", res.pathName);
            file.addResource(res);
            logger.trace("Added " + res.reskey + " to " + file.pathName);
        }
    }

    logger.trace("Writing out modified layout files");

    // now write out all the files that were resourcified
    for (i = 0; i < this.files.length; i++) {
        // will not write anything if the file is not dirty
        this.files[i].write();
    }
};

AndroidLayoutFileType.prototype.newFile = function(path) {
    var ret = new AndroidLayoutFile({
        project: this.project,
        pathName: path,
        type: this,
        API: API
    });
    this.files.push(ret);
    return ret;
};

AndroidLayoutFileType.prototype.getDataType = function() {
    return this.datatype;
};

AndroidLayoutFileType.prototype.getResourceTypes = function() {
    return {
        "string": "contextString"
    };
};

/**
 * Return the name of the node module that implements the resource file type, or
 * the path to a javascript file that implements the resource filetype.
 * @returns {Function|undefined} node module name or path, or undefined if this file type does not
 * need resource files
 */
AndroidLayoutFileType.prototype.getResourceFileType = function() {
    return AndroidResourceFileType;
};

module.exports = AndroidLayoutFileType;
