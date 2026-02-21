export interface ThemeColors {
    primary: string;
    secondary: string;
    accent: string;
    light: string;
    dark: string;
  }
  
  export interface Theme {
    id: string;
    name: string;
    colors: ThemeColors;
  }
  
  export const themes: Theme[] = [
    {
      id: 'blue',
      name: 'Blue Theme',
      colors: {
        primary: 'hsl(213, 94%, 68%)',
        secondary: 'hsl(213, 93%, 88%)',
        accent: 'hsl(213, 87%, 51%)',
        light: 'hsl(213, 100%, 97%)',
        dark: 'hsl(213, 78%, 33%)'
      }
    },
    {
      id: 'green',
      name: 'Green Theme',
      colors: {
        primary: 'hsl(158, 64%, 52%)',
        secondary: 'hsl(158, 58%, 78%)',
        accent: 'hsl(158, 75%, 39%)',
        light: 'hsl(158, 76%, 96%)',
        dark: 'hsl(158, 84%, 24%)'
      }
    },
    {
      id: 'purple',
      name: 'Purple Theme',
      colors: {
        primary: 'hsl(262, 83%, 58%)',
        secondary: 'hsl(262, 69%, 80%)',
        accent: 'hsl(262, 85%, 47%)',
        light: 'hsl(262, 87%, 97%)',
        dark: 'hsl(262, 80%, 35%)'
      }
    },
    {
      id: 'orange',
      name: 'Orange Theme',
      colors: {
        primary: 'hsl(20, 91%, 48%)',
        secondary: 'hsl(20, 87%, 74%)',
        accent: 'hsl(20, 90%, 39%)',
        light: 'hsl(20, 100%, 97%)',
        dark: 'hsl(20, 91%, 33%)'
      }
    },
    {
      id: 'red',
      name: 'Red Theme',
      colors: {
        primary: 'hsl(0, 84%, 60%)',
        secondary: 'hsl(0, 77%, 86%)',
        accent: 'hsl(0, 93%, 44%)',
        light: 'hsl(0, 85%, 97%)',
        dark: 'hsl(0, 74%, 42%)'
      }
    }
  ];
  
  export const getTheme = (id: string): Theme => {
    return themes.find(theme => theme.id === id) || themes[0];
  };
  