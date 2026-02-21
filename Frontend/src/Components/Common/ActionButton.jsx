import { IconButton, Tooltip } from '@mui/material';

function ActionButton({
  icon: Icon,
  name,
  action,
  className,
  tooltip,
  iconSize,
  id
}) {
  return (
    <Tooltip
      title={<span className="2xl:!text-lg ">{tooltip || name}</span>}
      placement="top"
      arrow
      disableInteractive
    >
      <IconButton
        className={`2xl:!p-2 !transition-all !duration-200 !ease-in-out hover:!scale-110 ${className}`}
        onClick={() => action(id)}
      >
        <Icon
          //  size={20}
          className={`2xl:text-3xl text-lg ${iconSize}`}
        />
      </IconButton>
    </Tooltip>
  );
}

export default ActionButton;
