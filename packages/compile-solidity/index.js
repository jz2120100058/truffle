const debug = require("debug")("compile"); // eslint-disable-line no-unused-vars
const path = require("path");
const expect = require("@truffle/expect");
const findContracts = require("@truffle/contract-sources");
const Config = require("@truffle/config");
const Profiler = require("./profiler");
const CompilerSupplier = require("./compilerSupplier");
const { run } = require("./run");
const { normalizeOptions } = require("./legacy/options");

const Compile = {
  // Most basic of the compile commands. Takes a hash of sources, where
  // the keys are file or module paths and the values are the bodies of
  // the contracts. Does not evaulate dependencies that aren't already given.
  async sources({ sources, options }) {
    const compilation = await run(sources, normalizeOptions(options));
    return compilation.contracts.length > 0
      ? { compilations: [compilation] }
      : { compilations: [] };
  },

  // contracts_directory: String. Directory where .sol files can be found.
  // quiet: Boolean. Suppress output. Defaults to false.
  // strict: Boolean. Return compiler warnings as errors. Defaults to false.
  // files: Array<String>. Explicit files to compile besides detected sources
  async all(options) {
    const paths = [
      ...new Set([
        ...(await findContracts(options.contracts_directory)),
        ...(options.files || [])
      ])
    ];

    return await Compile.sourcesWithDependencies({
      sources: paths,
      options: Config.default().merge(options)
    });
  },

  // contracts_directory: String. Directory where .sol files can be found.
  // build_directory: String. Optional. Directory where .sol.js files can be found. Only required if `all` is false.
  // all: Boolean. Compile all sources found. Defaults to true. If false, will compare sources against built files
  //      in the build directory to see what needs to be compiled.
  // quiet: Boolean. Suppress output. Defaults to false.
  // strict: Boolean. Return compiler warnings as errors. Defaults to false.
  // files: Array<String>. Explicit files to compile besides detected sources
  async necessary(options) {
    options.logger = options.logger || console;

    const paths = await Profiler.updated(options);

    return await Compile.sourcesWithDependencies({
      sources: paths,
      options: Config.default().merge(options)
    });
  },

  async sourcesWithDependencies({ sources, options }) {
    options.logger = options.logger || console;
    options.contracts_directory = options.contracts_directory || process.cwd();

    expect.options(options, [
      "working_directory",
      "contracts_directory",
      "resolver"
    ]);

    const config = Config.default().merge(options);
    const { allSources, compilationTargets } = await Profiler.requiredSources(
      config.with({
        paths: sources,
        base_path: options.contracts_directory,
        resolver: options.resolver
      })
    );

    const hasTargets = compilationTargets.length;

    hasTargets
      ? Compile.display(compilationTargets, options)
      : Compile.display(allSources, options);

    // when there are no sources, don't call run
    if (Object.keys(allSources).length === 0) {
      return { compilations: [] };
    }

    options.compilationTargets = compilationTargets;
    const { sourceIndexes, contracts, compiler } = await run(
      allSources,
      normalizeOptions(options)
    );
    const { name, version } = compiler;
    // returns CompilerResult - see @truffle/compile-common
    return contracts.length > 0
      ? {
          compilations: [
            {
              sourceIndexes,
              contracts,
              compiler: { name, version }
            }
          ]
        }
      : { compilations: [] };
  },

  display(paths, options) {
    if (options.quiet !== true) {
      if (!Array.isArray(paths)) {
        paths = Object.keys(paths);
      }

      const blacklistRegex = /^truffle\//;

      const sources = paths
        .sort()
        .map(contract => {
          if (path.isAbsolute(contract)) {
            contract =
              "." +
              path.sep +
              path.relative(options.working_directory, contract);
          }
          if (contract.match(blacklistRegex)) return;
          return contract;
        })
        .filter(contract => contract);
      options.events.emit("compile:sourcesToCompile", {
        sourceFileNames: sources
      });
    }
  }
};

module.exports = {
  Compile,
  CompilerSupplier
};
