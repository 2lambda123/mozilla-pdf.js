/* Copyright 2015 Mozilla Foundation
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
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createPromiseCapability, getVerbosityLevel, InvalidPDFException,
  isLittleEndian, MissingPDFException, OPS, PageViewport, PasswordException,
  PasswordResponses, removeNullCharacters, setVerbosityLevel, shadow,
  UnexpectedResponseException, UnknownErrorException, UNSUPPORTED_FEATURES,
  Util, VERBOSITY_LEVELS
} from '../shared/util';
import {
  getDocument, LoopbackPort, PDFDataRangeTransport, PDFWorker
} from './api';
import { AnnotationLayer } from './annotation_layer';
import { getFilenameFromUrl } from './dom_utils';
import globalScope from '../shared/global_scope';
import { Metadata } from './metadata';
import { renderTextLayer } from './text_layer';
import { SVGGraphics } from './svg';
import { WorkerOptions } from './worker_options';

// The global PDFJS object is now deprecated and will not be supported in
// the future. The members below are maintained for backward  compatibility
// and shall not be extended or modified. If the global.js is included as
// a module, we will create a global PDFJS object instance or use existing.
if (!globalScope.PDFJS) {
  globalScope.PDFJS = {};
}
var PDFJS = globalScope.PDFJS;

if (typeof PDFJSDev !== 'undefined') {
  PDFJS.version = PDFJSDev.eval('BUNDLE_VERSION');
  PDFJS.build = PDFJSDev.eval('BUNDLE_BUILD');
}

if (PDFJS.verbosity !== undefined) {
  setVerbosityLevel(PDFJS.verbosity);
}
delete PDFJS.verbosity;
Object.defineProperty(PDFJS, 'verbosity', {
  get() {
    return getVerbosityLevel();
  },
  set(level) {
    setVerbosityLevel(level);
  },
  enumerable: true,
  configurable: true,
});

PDFJS.VERBOSITY_LEVELS = VERBOSITY_LEVELS;
PDFJS.OPS = OPS;
PDFJS.UNSUPPORTED_FEATURES = UNSUPPORTED_FEATURES;
PDFJS.shadow = shadow;
Object.defineProperty(PDFJS, 'isLittleEndian', {
  configurable: true,
  get: function PDFJS_isLittleEndian() {
    return shadow(PDFJS, 'isLittleEndian', isLittleEndian());
  },
});
PDFJS.removeNullCharacters = removeNullCharacters;
PDFJS.PasswordResponses = PasswordResponses;
PDFJS.PasswordException = PasswordException;
PDFJS.UnknownErrorException = UnknownErrorException;
PDFJS.InvalidPDFException = InvalidPDFException;
PDFJS.MissingPDFException = MissingPDFException;
PDFJS.UnexpectedResponseException = UnexpectedResponseException;
PDFJS.Util = Util;
PDFJS.PageViewport = PageViewport;
PDFJS.createPromiseCapability = createPromiseCapability;

PDFJS.getDocument = getDocument;
PDFJS.LoopbackPort = LoopbackPort;
PDFJS.PDFDataRangeTransport = PDFDataRangeTransport;
PDFJS.PDFWorker = PDFWorker;

PDFJS.WorkerOptions = WorkerOptions;
PDFJS.getFilenameFromUrl = getFilenameFromUrl;

PDFJS.AnnotationLayer = AnnotationLayer;

PDFJS.renderTextLayer = renderTextLayer;

PDFJS.Metadata = Metadata;

PDFJS.SVGGraphics = SVGGraphics;

export {
  globalScope,
  PDFJS,
};
