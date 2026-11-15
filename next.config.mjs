/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["pdfjs-dist"],
    outputFileTracingIncludes: { "/api/analyze": ["./node_modules/pdfjs-dist/legacy/build/**"] },
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
  };
  export default nextConfig;
  