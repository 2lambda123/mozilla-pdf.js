/* Copyright 2014 Mozilla Foundation
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

'use strict';

if (!PDFJS.PDFViewer || !PDFJS.getDocument) {
  alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist-install`');
}

// The workerSrc property shall be specified.
//
PDFJS.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.js';

// Some PDFs need external cmaps.
//
// PDFJS.cMapUrl = '../../node_modules/pdfjs-dist/cmaps/';
// PDFJS.cMapPacked = true;

var DEFAULT_URL = '../../web/compressed.tracemonkey-pldi-09.pdf';
var SEARCH_FOR = ''; // try 'Mozilla';

var container = document.getElementById('viewerContainer');

// pdfLinkService not used since single page viewer

var pdfSinglePageViewer = new PDFJS.PDFViewer({
  container: container,
});

// (Optionally) enable find controller.
var pdfFindController = new PDFJS.PDFFindController({
  pdfSinglePageViewer: pdfSinglePageViewer
});
pdfSinglePageViewer.setFindController(pdfFindController);

container.addEventListener('pagesinit', function () {
  //Changing default scale value
  pdfSinglePageViewer.currentScaleValue = 'page-width';

  if (SEARCH_FOR) { // We can try search for things
    pdfFindController.executeCommand('find', {query: SEARCH_FOR});
  }
});

// Loading document.
PDFJS.getDocument(DEFAULT_URL).then(function (pdfDocument) {
  // Document loaded, specifying document for the viewer
  pdfSinglePageViewer.setDocument(pdfDocument);

});
