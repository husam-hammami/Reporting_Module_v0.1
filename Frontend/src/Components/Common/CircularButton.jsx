import { Button, Tooltip } from '@mui/material';

function CircularButton({
  icon: Icon,
  size,
  action,
  className,
  tooltip,
  type,
  id
}) {
  return (
    <>
      <Tooltip
        title={<span className="2xl:!text-lg ">{tooltip || ''}</span>}
        arrow
        placement="top"
        disableInteractive
      >
        <Button
          type={`${type ? type : 'submit'}`}
          size="large"
          className="!bg-transparent !p-0 !rounded-full"
          onClick={action}
        >
          <Icon
            className={`text-green-700 hover:text-green-600 rounded-full transition-all duration-200 ease-in-out hover:scale-110 ${className}`}
            size={size || 65}
          />
        </Button>
      </Tooltip>
    </>
  );
}

export default CircularButton;
