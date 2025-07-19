export default function isDevelopmentMode(){
    const inDevMode= import.meta.env.MODE;
    return inDevMode != null && inDevMode === 'development';
}