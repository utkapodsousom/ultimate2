const { src, dest, watch, series, parallel, lastRun } = require('gulp');
const gulpLoadPlugins = require('gulp-load-plugins');
const browserSync = require('browser-sync');
const del = require('del');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const { argv } = require('yargs');
const svgSprite = require('gulp-svg-sprite');
const webp = require('gulp-webp');
const imagemin = require('gulp-imagemin');
const uglify = require('gulp-uglify-es').default;

const $ = gulpLoadPlugins();
browserSync.init({
  browser: "google-chrome-stable",
});
const server = browserSync.create();

const port = argv.port || 9000;

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const isDev = !isProd && !isTest;

const spriterConfig = {
  dest: "dist",
  log: "info",
  mode: {
    css: {
      example: true,
      render: {
        scss: true
      }
    },
    symbol: {
      example: true
    }
  }
};

function svgSprites() {
  return src("app/images/icons/svg/*")
    .pipe(svgSprite(spriterConfig))
    .pipe($.if(!isProd, dest("app/images"), dest("dist/images")));
}

function styles() {
  return src('app/styles/*.scss', {
    sourcemaps: !isProd,
  })
    .pipe($.plumber())
    .pipe($.sass.sync({
      outputStyle: 'expanded',
      precision: 10,
      includePaths: ['.']
    }).on('error', $.sass.logError))
    .pipe($.postcss([
      autoprefixer()
    ]))
    .pipe(dest('.tmp/styles', {
      sourcemaps: !isProd,
    }))
    .pipe(server.reload({stream: true}));
};

function scripts() {
  return src('app/scripts/**/*.js', {
    sourcemaps: !isProd,
  })
    .pipe($.plumber())
    .pipe($.babel())
    .pipe(dest('.tmp/scripts', {
      sourcemaps: !isProd ? '.' : false,
    }))
    .pipe(server.reload({stream: true}));
};


const lintBase = (files, options) => {
  return src(files)
    .pipe($.eslint(options))
    .pipe(server.reload({stream: true, once: true}))
    .pipe($.eslint.format())
    .pipe($.if(!server.active, $.eslint.failAfterError()));
}
function lint() {
  return lintBase('app/scripts/**/*.js', { fix: true })
    .pipe(dest('app/scripts'));
};
function lintTest() {
  return lintBase('test/spec/**/*.js');
};

function images() {
  return src('app/images/**/*', { since: lastRun(images) })
    .pipe(imagemin())
    .pipe(dest('dist/images'));
};

function html() {
  return src('app/*.html')
    .pipe($.useref({searchPath: ['.tmp', 'app', '.']}))
    .pipe($.if(/\.js$/, uglify({compress: {drop_console: true}})))
    .pipe($.if(/\.css$/, $.postcss([cssnano({safe: true, autoprefixer: false})])))
    .pipe($.if(/\.html$/, $.htmlmin({
      collapseWhitespace: true,
      minifyCSS: false,
      minifyJS: {compress: {drop_console: true}},
      processConditionalComments: false,
      removeComments: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true
    })))
    .pipe(dest('dist'));
}

function convertToWEBP() {
  return src("app/images/*.{jpg,JPG,jpeg,JPEG,png}")
    .pipe(webp())
    .pipe($.if(!isProd, dest('.tmp/images/webp'), dest('dist/images/webp')));
}

function fonts() {
  return src('app/fonts/**/*.{eot,svg,ttf,woff,woff2}')
    .pipe($.if(!isProd, dest('.tmp/fonts'), dest('dist/fonts')));
};

function extras() {
  return src([
    'app/*',
    '!app/*.html'
  ], {
    dot: true
  }).pipe(dest('dist'));
};

function clean() {
  return del([".tmp", "dist", "app/images/icons/sprite.png", "app/images/icons/sprite.css"]);
}

function measureSize() {
  return src('dist/**/*')
    .pipe($.size({title: 'build', gzip: true}));
}

const build = series(
  clean,
  parallel(
    lint,
    series(parallel(styles, scripts), html),
    fonts,
    extras
  ),
  images,
  convertToWEBP,
  svgSprites,
  measureSize
);

function startAppServer() {
  server.init({
    notify: false,
    port,
    server: {
      baseDir: ['.tmp', 'app'],
      routes: {
        '/node_modules': 'node_modules'
      }
    }
  });

  watch([
    'app/*.html',
    'app/images/**/*',
    '.tmp/fonts/**/*'
  ]).on('change', server.reload);

  watch('app/styles/**/*.scss', styles);
  watch('app/scripts/**/*.js', scripts);
  watch('app/fonts/**/*', fonts);
}

function startTestServer() {
  server.init({
    notify: false,
    port,
    ui: false,
    server: {
      baseDir: 'test',
      routes: {
        '/scripts': '.tmp/scripts',
        '/node_modules': 'node_modules'
      }
    }
  });

  watch('test/index.html').on('change', server.reload);
  watch('app/scripts/**/*.js', scripts);
  watch('test/spec/**/*.js', lintTest);
}

function startDistServer() {
  server.init({
    notify: false,
    port,
    server: {
      baseDir: 'dist',
      routes: {
        '/node_modules': 'node_modules'
      }
    }
  });
}

let serve;
if (isDev) {
  serve = series(clean, parallel(styles, scripts, svgSprites, convertToWEBP), startAppServer);
} else if (isTest) {
  serve = series(clean, scripts, startTestServer);
} else if (isProd) {
  serve = series(build, startDistServer);
}

exports.webp = convertToWEBP;
exports.clean = clean;
exports.serve = serve;
exports.build = build;
exports.default = build;
