/* PlayOn Active — site interactions */
(function () {
  "use strict";

  // Mobile nav toggle
  var nav = document.querySelector(".nav");
  var toggle = document.querySelector(".nav__toggle");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("is-open");
    });
  }

  // Scroll reveal
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // FAQ accordion
  document.querySelectorAll(".faq__q").forEach(function (q) {
    q.addEventListener("click", function () {
      var item = q.closest(".faq__item");
      var ans = item.querySelector(".faq__a");
      var open = item.classList.contains("open");
      // close siblings
      var parent = item.parentElement;
      parent.querySelectorAll(".faq__item.open").forEach(function (sib) {
        if (sib !== item) {
          sib.classList.remove("open");
          sib.querySelector(".faq__a").style.maxHeight = null;
        }
      });
      if (open) {
        item.classList.remove("open");
        ans.style.maxHeight = null;
      } else {
        item.classList.add("open");
        ans.style.maxHeight = ans.scrollHeight + "px";
      }
    });
  });

  // Contact / enquiry form (front-end demo handler)
  var form = document.querySelector("#enquiry-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var success = document.querySelector(".form-success");
      if (success) {
        success.classList.add("show");
        success.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      form.reset();
    });
  }

  // Footer year
  var yr = document.querySelector("#year");
  if (yr) { yr.textContent = new Date().getFullYear(); }

  // Sliders / carousels
  document.querySelectorAll("[data-slider]").forEach(function (slider) {
    var track = slider.querySelector(".slider__track");
    var slides = Array.prototype.slice.call(track.children);
    if (slides.length <= 1) {
      var arrows = slider.querySelectorAll(".slider__btn");
      arrows.forEach(function (a) { a.style.display = "none"; });
      return;
    }
    var index = 0;
    var dotsWrap = slider.querySelector(".slider__dots");
    var dots = [];

    if (dotsWrap) {
      slides.forEach(function (_, i) {
        var d = document.createElement("button");
        d.className = "slider__dot" + (i === 0 ? " is-active" : "");
        d.setAttribute("aria-label", "Go to slide " + (i + 1));
        d.addEventListener("click", function () { go(i); });
        dotsWrap.appendChild(d);
        dots.push(d);
      });
    }

    function update() {
      track.style.transform = "translateX(" + (-index * 100) + "%)";
      dots.forEach(function (d, i) { d.classList.toggle("is-active", i === index); });
    }
    function go(i) { index = (i + slides.length) % slides.length; update(); }
    function next() { go(index + 1); }
    function prev() { go(index - 1); }

    var nextBtn = slider.querySelector(".slider__btn--next");
    var prevBtn = slider.querySelector(".slider__btn--prev");
    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);

    // Autoplay (pause on hover / when tab hidden)
    var delay = parseInt(slider.getAttribute("data-autoplay"), 10);
    var timer = null;
    function start() { if (delay > 0) { stop(); timer = setInterval(next, delay); } }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    slider.addEventListener("mouseenter", stop);
    slider.addEventListener("mouseleave", start);
    start();
  });
})();
