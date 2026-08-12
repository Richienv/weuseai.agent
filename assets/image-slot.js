/*
 * <image-slot> — image placeholder with drag-and-drop replacement.
 *
 * Used 24× on the landing showcase cards. Every slot ships a real `src`; the
 * drop affordance is an authoring convenience (swap artwork in the browser to
 * try a composition) and is NOT a customer-facing feature — nothing is uploaded
 * anywhere, and the swap lives in that tab until reload.
 *
 *   <image-slot id="sk-1" src="/assets/sc-duit.jpg"
 *               shape="rect" fit="cover" placeholder="Drop gambar"></image-slot>
 *
 * Attributes
 *   src          image URL. If it 404s, the placeholder shows instead of a
 *                broken-image glyph, so a pending asset degrades quietly.
 *   shape        rect (default) | round
 *   fit          cover (default) | contain
 *   placeholder  text shown when there is no image, or the image fails
 *
 * SHADOW DOM IS LOAD-BEARING — do not "simplify" it away.
 *
 * The page runs on the DC runtime, which reconciles the template DOM and
 * removes children it believes it owns. A first version of this component
 * appended the <img> into the light DOM; the runtime then tried to remove a
 * node that was no longer where it expected and the whole page died at boot
 * with `Failed to execute 'removeChild' on 'Node'` — a black screen, not a
 * degraded one. Rendering into a shadow root keeps every node this component
 * creates invisible to that reconciler.
 *
 * This does NOT disturb the showcase compositing. The brand tint
 * (`mix-blend-mode:color`), the scrim and the sweep are SIBLINGS of the slot
 * wrapper inside the showcase, and `isolation:isolate` sits on the showcase
 * container — the blend group is formed above this element, so a shadow
 * boundary here changes nothing about how it paints.
 *
 * Two more details that matter:
 *  - `pointer-events` stays default so the slot remains droppable. Every
 *    overlay above it is `pointer-events:none` for exactly this reason.
 *  - `draggable="false"` on the img: without it, dragging the artwork starts a
 *    native image-drag instead of a drop onto the slot.
 */
(function () {
  'use strict';
  if (!window.customElements || customElements.get('image-slot')) return;

  var SHEET = [
    ':host{display:block;position:relative;overflow:hidden;background:#0e0c10;'
    // Isi pembungkusnya. Tanpa width/height eksplisit, host memakai tinggi
    // otomatis: img height:100% jatuh ke auto, jadi slot mengikuti rasio
    // gambar (428/760) alih-alih wadahnya. Di kartu skill itu kebetulan pas
    // karena wadahnya 16:9 — di panel Memory yang tinggi, gambar cuma
    // menutupi 35% dan sisanya kosong.
    + 'width:100%;height:100%}',
    ':host([shape="round"]){border-radius:50%}',
    'img{width:100%;height:100%;display:block;object-fit:cover}',
    ':host([fit="contain"]) img{object-fit:contain}',
    '.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    'font:500 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;',
    'text-transform:uppercase;color:rgba(255,255,255,.28);text-align:center;padding:12px;',
    'border:1px dashed rgba(255,255,255,.14);border-radius:inherit;',
    'transition:color .18s,border-color .18s,background .18s}',
    ':host(.is-over) .ph{color:rgba(255,255,255,.72);border-color:rgba(238,60,48,.6);',
    'background:rgba(238,60,48,.08)}'
  ].join('');

  var Slot = function () { return Reflect.construct(HTMLElement, [], Slot); };
  Slot.prototype = Object.create(HTMLElement.prototype);
  Slot.prototype.constructor = Slot;
  Object.setPrototypeOf(Slot, HTMLElement);

  Slot.observedAttributes = ['src', 'placeholder'];

  Slot.prototype.connectedCallback = function () {
    if (!this._root) {
      this._root = this.attachShadow({ mode: 'open' });
      var st = document.createElement('style');
      st.textContent = SHEET;
      this._root.appendChild(st);
      this._wire();
    }
    this._render();
  };

  Slot.prototype.attributeChangedCallback = function (n, o, v) {
    if (this._root && o !== v) this._render();
  };

  Slot.prototype._wire = function () {
    var self = this;
    var depth = 0; // dragenter/dragleave fire per descendant; count them

    this.addEventListener('dragenter', function (e) {
      e.preventDefault(); depth++; self.classList.add('is-over');
    });
    this.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (depth === 0) self.classList.remove('is-over');
    });
    this.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; self.classList.remove('is-over');
      var dt = e.dataTransfer;
      if (!dt) return;
      var file = dt.files && dt.files[0];
      if (file && /^image\//.test(file.type)) {
        var fr = new FileReader();
        fr.onload = function () { self._show(String(fr.result)); };
        fr.readAsDataURL(file);
        return;
      }
      var url = dt.getData('text/uri-list') || dt.getData('text/plain');
      if (url) self._show(url.trim());
    });
  };

  Slot.prototype._render = function () {
    var src = this.getAttribute('src');
    if (src) this._show(src); else this._placeholder(false);
  };

  Slot.prototype._show = function (src) {
    var self = this;
    var img = this._root.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.addEventListener('error', function () {
        img.remove();
        self._placeholder(true);
      });
      this._root.appendChild(img);
    }
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    var ph = this._root.querySelector('.ph');
    if (ph) ph.remove();
  };

  Slot.prototype._placeholder = function (failed) {
    if (this._root.querySelector('.ph')) return;
    var d = document.createElement('div');
    d.className = 'ph';
    d.textContent = this.getAttribute('placeholder') || 'Drop gambar';
    if (failed) d.setAttribute('data-missing', this.getAttribute('src') || '');
    this._root.appendChild(d);
  };

  customElements.define('image-slot', Slot);
})();
