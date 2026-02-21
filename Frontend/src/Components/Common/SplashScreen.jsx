import HercLogo from '../../Assets/Herc_Logo_v2.0';


const SplashScreen = () => {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-zinc-200 dark:bg-zinc-900 z-50 text-indigo-500">
            <HercLogo className='w-80 h-80 animate-fade-loop'/>
        </div>
    );
};

export default SplashScreen;
