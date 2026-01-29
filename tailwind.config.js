/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Hylite Studio Color Tokens
                "bg-dark": "#0D1B2A", // Midnight Navy
                "bg-light": "#F9FAFC", // Off-white
                "surface-dark": "#1B263B",
                "surface-light": "#FFFFFF",
                "text-primary-dark": "#F0F4F8",
                "text-primary-light": "#2F3E46",
                "brand-accent": "#1878E5", // Blue
                "brand-success": "#00C46A",
                "brand-warning": "#FF6B00",
            },
            borderRadius: {
                custom: "12px",
            },
            fontFamily: {
                sans: ["Inter", "sans-serif"],
            },
            boxShadow: {
                "elevation-4": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            },
        },
    },
    plugins: [],
}
