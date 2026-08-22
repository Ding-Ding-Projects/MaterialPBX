<?php
namespace FreePBX\Console\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class Materialpbx extends Command
{
    protected $FreePBX;

    public function __construct($FreePBX)
    {
        $this->FreePBX = $FreePBX;
        parent::__construct();
    }

    protected function configure()
    {
        $this->setName('materialpbx')
            ->setDescription('Run bounded MaterialPBX bridge operations')
            ->addOption('operation', null, InputOption::VALUE_REQUIRED, 'sync or submit-call-file')
            ->addOption('kind', null, InputOption::VALUE_REQUIRED)
            ->addOption('id', null, InputOption::VALUE_REQUIRED)
            ->addOption('deleted', null, InputOption::VALUE_NONE);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        try {
            $module = $this->FreePBX->Materialpbx;
            $operation = (string) $input->getOption('operation');
            if ($operation === 'sync') {
                $result = $module->syncResource((string) $input->getOption('kind'), (string) $input->getOption('id'), (bool) $input->getOption('deleted'));
            } elseif ($operation === 'submit-call-file') {
                $result = $module->submitCallFile((string) $input->getOption('id'));
            } else {
                throw new \InvalidArgumentException('Unknown operation');
            }
            $output->writeln(json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            return Command::SUCCESS;
        } catch (\Throwable $error) {
            $output->getErrorOutput()->writeln($error->getMessage());
            return Command::FAILURE;
        }
    }
}
